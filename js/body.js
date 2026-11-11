// Body input. Three sources feed one shared state:
//   pose    - MediaPipe Pose (webcam): two hands + torso, the real thing
//   motion  - webcam frame-differencing fallback if the pose model can't load
//   pointer - mouse / touch acts as one hand (for testing without a camera)
//
// Derived signals every world can use:
//   motion     0..1  how much you're moving right now
//   stillness  0..1  builds slowly while you hold still, drains when you move
//   rise       0..1  hands lifted above shoulders
//   openness   0..1  arms spread wide
//   pulse      1..0  fires once each time stillness fills up (the reward)

const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createBody() {
  const hand = () => ({ x: .5, y: .5, vx: 0, vy: 0, speed: 0, str: 0, seen: 0 });
  const S = {
    source: 'none',
    hands: [hand(), hand()],
    body: { x: .5, y: .5, presence: 0 },
    motion: 0, stillness: 0, rise: 0, openness: 0, pulse: 0,
    rewards: 0,
  };

  let video = null, landmarker = null, lastVideoT = -1, prevLm = null, prevLmT = 0;
  let diffCtx = null, prevFrame = null;
  let rawMotion = 0, pointerT = 0, charged = false;

  // ---------- pointer ----------
  let lastPt = null;
  function onPointer(e, down) {
    const x = e.clientX / innerWidth, y = 1 - e.clientY / innerHeight, now = performance.now();
    const h = S.hands[0];
    if (lastPt) {
      const dt = Math.max(.008, (now - lastPt.t) / 1000);
      const sp = Math.hypot(x - lastPt.x, y - lastPt.y) / dt;
      h.speed = lerp(h.speed, sp, .3);
      if (S.source === 'pointer' || S.source === 'none') rawMotion = Math.max(rawMotion, clamp(sp / 2, 0, 1));
    }
    if (S.source === 'none' || S.source === 'pointer') {
      S.source = 'pointer';
      h.vx = x - h.x; h.vy = y - h.y; h.x = x; h.y = y; h.seen = now;
      h.str = Math.max(h.str, down ? .9 : clamp(.25 + h.speed * .4, 0, 1));
    }
    lastPt = { x, y, t: now }; pointerT = now;
  }
  addEventListener('pointermove', e => onPointer(e, false));
  addEventListener('pointerdown', e => onPointer(e, true));

  // ---------- camera ----------
  async function startCamera(onStatus) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    video = document.createElement('video');
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play();
    S.source = 'motion';
    onStatus?.('Camera on. Loading body tracking…');
    try {
      const { FilesetResolver, PoseLandmarker } = await import(MP_URL);
      const files = await FilesetResolver.forVisionTasks(MP_WASM);
      const opts = d => ({ baseOptions: { modelAssetPath: MP_MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1 });
      try { landmarker = await PoseLandmarker.createFromOptions(files, opts('GPU')); }
      catch { landmarker = await PoseLandmarker.createFromOptions(files, opts('CPU')); }
      S.source = 'pose';
      onStatus?.('Body tracking on. Step back until your whole upper body is in view.');
    } catch (err) {
      console.warn('Pose model unavailable, falling back to motion detection', err);
      onStatus?.('Body tracking couldn\'t load, so it\'s using simple motion detection instead.');
    }
    return video;
  }

  // ---------- pose ----------
  const KEY = [0, 11, 12, 13, 14, 15, 16, 23, 24];
  function readPose(now) {
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoT) return;
    lastVideoT = video.currentTime;
    const res = landmarker.detectForVideo(video, now);
    const lm = res.landmarks && res.landmarks[0];
    if (!lm) { S.body.presence = lerp(S.body.presence, 0, .1); S.hands.forEach(h => h.str *= .9); prevLm = null; return; }
    // mirror x (selfie view) and flip y so up is up
    const P = i => ({ x: 1 - lm[i].x, y: 1 - lm[i].y, v: lm[i].visibility ?? 1 });
    const dt = prevLm ? Math.max(.016, (now - prevLmT) / 1000) : 0;
    if (prevLm) {
      let s = 0;
      for (const i of KEY) s += Math.hypot(lm[i].x - prevLm[i].x, lm[i].y - prevLm[i].y);
      rawMotion = Math.max(rawMotion, clamp(s / KEY.length / dt / .9, 0, 1));
    }
    prevLm = lm.map(p => ({ x: p.x, y: p.y })); prevLmT = now;

    const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
    const cx = (ls.x + rs.x + lh.x + rh.x) / 4, cy = (ls.y + rs.y + lh.y + rh.y) / 4;
    S.body.x = lerp(S.body.x, cx, .25); S.body.y = lerp(S.body.y, cy, .25);
    S.body.presence = lerp(S.body.presence, 1, .1);
    const shoulderY = (ls.y + rs.y) / 2, shoulderW = Math.max(.05, Math.hypot(ls.x - rs.x, ls.y - rs.y));

    // wrists, nudged toward the index fingers so the "hand" sits in the palm
    const wrists = [[15, 19], [16, 20]];
    let rise = 0;
    wrists.forEach(([w, f], k) => {
      const a = P(w), b = P(f), h = S.hands[k];
      const x = (a.x * 2 + b.x) / 3, y = (a.y * 2 + b.y) / 3;
      if (a.v < .4) { h.str *= .85; return; }
      const nx = lerp(h.x, x, .45), ny = lerp(h.y, y, .45);
      const sp = dt ? Math.hypot(nx - h.x, ny - h.y) / dt : 0;
      h.vx = nx - h.x; h.vy = ny - h.y; h.x = nx; h.y = ny; h.seen = now;
      h.speed = lerp(h.speed, sp, .4);
      h.str = lerp(h.str, clamp(.35 + h.speed * .5, 0, 1), .3);
      rise += clamp((a.y - shoulderY) / .25, 0, 1);
    });
    S.rise = lerp(S.rise, rise / 2, .12);
    const span = Math.hypot(S.hands[0].x - S.hands[1].x, S.hands[0].y - S.hands[1].y) / shoulderW;
    S.openness = lerp(S.openness, clamp((span - 1.2) / 2.5, 0, 1), .12);
  }

  // ---------- frame-difference fallback ----------
  const GW = 48, GH = 36;
  function readDiff() {
    if (!video || video.readyState < 2) return;
    if (!diffCtx) { const c = document.createElement('canvas'); c.width = GW; c.height = GH; diffCtx = c.getContext('2d', { willReadFrequently: true }); }
    diffCtx.save(); diffCtx.scale(-1, 1); diffCtx.drawImage(video, -GW, 0, GW, GH); diffCtx.restore();
    const d = diffCtx.getImageData(0, 0, GW, GH).data, cur = new Float32Array(GW * GH);
    for (let i = 0; i < cur.length; i++) cur[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    if (prevFrame) {
      let s = 0, sx = 0, sy = 0;
      for (let i = 0; i < cur.length; i++) {
        const df = Math.abs(cur[i] - prevFrame[i]);
        if (df > .06) { s += df; sx += df * (i % GW); sy += df * ((i / GW) | 0); }
      }
      rawMotion = Math.max(rawMotion, clamp(s / 25, 0, 1));
      const h = S.hands[0];
      if (s > .8) {
        const x = sx / s / GW, y = 1 - sy / s / GH;
        h.vx = x - h.x; h.vy = y - h.y; h.x = lerp(h.x, x, .2); h.y = lerp(h.y, y, .2);
        h.str = lerp(h.str, clamp(s / 20, .2, 1), .2); h.seen = performance.now();
        S.body.x = lerp(S.body.x, x, .05); S.body.y = lerp(S.body.y, y, .05); S.body.presence = lerp(S.body.presence, 1, .05);
      }
    }
    prevFrame = cur;
  }

  // ---------- per-frame ----------
  function update(dt, now) {
    if (S.source === 'pose') readPose(now);
    else if (S.source === 'motion') readDiff();

    S.motion = lerp(S.motion, rawMotion, rawMotion > S.motion ? .25 : .05);
    rawMotion *= .5;

    // stillness: fills over ~7s of calm, drains ~3x faster when you move
    const calm = S.motion < .12;
    S.stillness = clamp(S.stillness + (calm ? dt / 7 : -dt / 2.2 * (S.motion * 3)), 0, 1);
    if (S.stillness >= 1 && !charged) { charged = true; S.pulse = 1; S.rewards++; }
    if (S.stillness < .6) charged = false;
    S.pulse = Math.max(0, S.pulse - dt / 4);

    for (const h of S.hands) {
      if (now - h.seen > 600) h.str *= .94;
      h.speed *= .92;
    }
    if (S.source === 'pointer' && now - pointerT > 4000) S.body.presence *= .98;
    if (S.source !== 'pose') { S.rise *= .98; S.openness *= .98; }
  }

  return { state: S, update, startCamera, get video() { return video; } };
}
