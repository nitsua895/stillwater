// Body input. Sources, best first:
//   pose    - MediaPipe Pose (webcam): two hands, torso AND a full-body silhouette mask
//   motion  - webcam frame-differencing if the pose model can't load (rough moving silhouette)
//   pointer - mouse / touch acts as one hand (no camera)
//
// Signals: hands, body centre, silhouette mask, motion, stillness, rise, openness, reward pulse.

const MP_VER = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const MASK_W = 160, MASK_H = 120;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// One Euro filter: very smooth when you're slow, still responsive when you move fast.
// Tuned toward stability: the general form of you, not every tremor.
function oneEuro(minCutoff = .6, beta = .35, dCutoff = 1) {
  let x = null, dx = 0, lastT = 0;
  const alpha = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  return (v, t) => {
    if (x === null) { x = v; lastT = t; return v; }
    const dt = Math.max(1e-3, t - lastT); lastT = t;
    const d = (v - x) / dt;
    dx += alpha(dCutoff, dt) * (d - dx);
    const cut = minCutoff + beta * Math.abs(dx);
    x += alpha(cut, dt) * (v - x);
    return x;
  };
}

// limbs as soft capsules: [from, to, width as a fraction of shoulder width]
const BONES = [[11, 13, .34], [13, 15, .28], [12, 14, .34], [14, 16, .28],
  [23, 25, .44], [25, 27, .34], [24, 26, .44], [26, 28, .34], [0, 33, .3]];

export function createBody() {
  const hand = () => ({ x: .5, y: .5, vx: 0, vy: 0, speed: 0, str: 0, seen: 0, stillT: 0 });
  const S = {
    source: 'none',
    hands: [hand(), hand()],
    body: { x: .5, y: .5, presence: 0 },
    motion: 0, stillness: 0, rise: 0, openness: 0, pulse: 0, rewards: 0,
    // silhouette: RGBA8, row 0 = bottom, mirrored. R = now, G = last frame, B = soft (blurred)
    mask: new Uint8Array(MASK_W * MASK_H * 4),
    maskOn: false, maskDirty: false,
    camMap: [1, 1],
  };
  const cur = new Float32Array(MASK_W * MASK_H), soft = new Float32Array(MASK_W * MASK_H), tmp = new Float32Array(MASK_W * MASK_H);

  const filt = Array.from({ length: 34 }, () => [oneEuro(1.4, 1.2), oneEuro(1.4, 1.2), oneEuro(1, 0)]);
  const sk = document.createElement('canvas'); sk.width = MASK_W; sk.height = MASK_H;
  const skx = sk.getContext('2d', { willReadFrequently: true });
  let video = null, landmarker = null, lastVideoT = -1, prevLm = null, prevLmT = 0;
  let diffCtx = null, prevFrame = null;
  let rawMotion = 0, pointerT = 0, charged = false;

  // camera image -> screen, "contain" fit so your whole body stays visible
  function updateCamMap() {
    if (!video || !video.videoWidth) return;
    const k = (video.videoWidth / video.videoHeight) / (innerWidth / innerHeight);
    S.camMap = k < 1 ? [1 / k, 1] : [1, k];
  }
  const toScreen = (cx, cy) => [(cx - .5) / S.camMap[0] + .5, (cy - .5) / S.camMap[1] + .5];

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
    updateCamMap(); addEventListener('resize', updateCamMap);
    S.source = 'motion'; S.maskOn = true;
    onStatus?.('Camera on. Loading body tracking…');
    try {
      const { FilesetResolver, PoseLandmarker } = await import(MP_URL);
      const files = await FilesetResolver.forVisionTasks(MP_WASM);
      const opts = d => ({ baseOptions: { modelAssetPath: MP_MODEL, delegate: d }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true });
      try { landmarker = await PoseLandmarker.createFromOptions(files, opts('GPU')); }
      catch { landmarker = await PoseLandmarker.createFromOptions(files, opts('CPU')); }
      S.source = 'pose';
      onStatus?.('Body tracking on. Step back until your whole body is in view. The world will draw you in.');
    } catch (err) {
      console.warn('Pose model unavailable, falling back to motion detection', err);
      onStatus?.('Body tracking couldn\'t load, so it\'s using simple motion detection instead.');
    }
    return video;
  }

  // ---------- silhouette ----------
  // copy a source mask (row 0 = top, not mirrored) into cur[] (row 0 = bottom, mirrored), smoothing over time
  function ingestMask(src, sw, sh, gain = 1) {
    for (let y = 0; y < MASK_H; y++) {
      const fy = clamp((MASK_H - 1 - y + .5) / MASK_H * sh - .5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < MASK_W; x++) {
        const fx = clamp((MASK_W - 1 - x + .5) / MASK_W * sw - .5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const v = lerp(lerp(src[y0 * sw + x0], src[y0 * sw + x1], tx), lerp(src[y1 * sw + x0], src[y1 * sw + x1], tx), ty);
        const i = y * MASK_W + x;
        cur[i] = lerp(cur[i], clamp(v * gain, 0, 1), .15);
      }
    }
    finishMask();
  }
  function ingestSeg(src, sw, sh) {
    for (let y = 0; y < MASK_H; y++) {
      const fy = clamp((MASK_H - 1 - y + .5) / MASK_H * sh - .5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < MASK_W; x++) {
        const fx = clamp((MASK_W - 1 - x + .5) / MASK_W * sw - .5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        let v = lerp(lerp(src[y0 * sw + x0], src[y0 * sw + x1], tx), lerp(src[y1 * sw + x0], src[y1 * sw + x1], tx), ty);
        v = clamp((v - .25) / .5, 0, 1);                 // ignore faint, flickery guesses
        const i = y * MASK_W + x;
        // grow quickly (responsive), shrink a little slower (no flicker)
        cur[i] = lerp(cur[i], v, v > cur[i] ? .55 : .3);
      }
    }
    finishMask();
  }
  // a random point on the edge of your silhouette, in screen uv (for things to grow around you)
  function edgePoint() {
    if (!S.maskOn) return null;
    for (let k = 0; k < 60; k++) {
      const x = (Math.random() * MASK_W) | 0, y = (Math.random() * MASK_H) | 0, v = soft[y * MASK_W + x];
      if (v > .25 && v < .6) {
        const cx = (x + .5) / MASK_W, cy = (y + .5) / MASK_H;
        return [(cx - .5) / S.camMap[0] + .5, (cy - .5) / S.camMap[1] + .5];
      }
    }
    return null;
  }
  function finishMask() {
    // soft copy: two box-blur passes (horizontal then vertical), radius 4
    const R = 3;
    for (let y = 0; y < MASK_H; y++) {
      let s = 0; const row = y * MASK_W;
      for (let x = -R; x <= R; x++) s += cur[row + clamp(x, 0, MASK_W - 1)];
      for (let x = 0; x < MASK_W; x++) {
        tmp[row + x] = s / (2 * R + 1);
        s += cur[row + Math.min(MASK_W - 1, x + R + 1)] - cur[row + Math.max(0, x - R)];
      }
    }
    for (let x = 0; x < MASK_W; x++) {
      let s = 0;
      for (let y = -R; y <= R; y++) s += tmp[clamp(y, 0, MASK_H - 1) * MASK_W + x];
      for (let y = 0; y < MASK_H; y++) {
        soft[y * MASK_W + x] = s / (2 * R + 1);
        s += tmp[Math.min(MASK_H - 1, y + R + 1) * MASK_W + x] - tmp[Math.max(0, y - R) * MASK_W + x];
      }
    }
    const m = S.mask;
    for (let i = 0; i < cur.length; i++) {
      const j = i * 4;
      m[j + 1] = m[j];                       // last frame
      m[j] = cur[i] * 255;                   // now
      m[j + 2] = soft[i] * 255;              // soft
      m[j + 3] = 255;
    }
    S.maskDirty = true;
  }

  // ---------- the form: torso, head and limbs from smoothed landmarks ----------
  function drawForm(lm) {
    const X = p => (p.x - .5) * S.camMap[0] * MASK_W + MASK_W / 2;          // screen -> mask pixels
    const Y = p => (1 - ((p.y - .5) * S.camMap[1] + .5)) * MASK_H;           // canvas row 0 = top
    const sw = Math.hypot(X(lm[11]) - X(lm[12]), Y(lm[11]) - Y(lm[12])) || 10;
    skx.clearRect(0, 0, MASK_W, MASK_H);
    skx.fillStyle = skx.strokeStyle = '#fff'; skx.lineCap = 'round'; skx.lineJoin = 'round';
    const ok = (...i) => i.every(k => lm[k].v > .5);
    // torso: shoulders and hips, slightly widened
    if (ok(11, 12)) {
      const hipsOK = ok(23, 24);
      const pts = hipsOK ? [11, 12, 24, 23] : [11, 12];
      skx.beginPath();
      const cx = pts.reduce((a, k) => a + X(lm[k]), 0) / pts.length, cy = pts.reduce((a, k) => a + Y(lm[k]), 0) / pts.length;
      if (hipsOK) {
        pts.forEach((k, j) => { const x = cx + (X(lm[k]) - cx) * 1.12, y = cy + (Y(lm[k]) - cy) * 1.04; j ? skx.lineTo(x, y) : skx.moveTo(x, y); });
        skx.closePath(); skx.lineWidth = sw * .3; skx.fill(); skx.stroke();
      } else {
        // only shoulders visible: a torso falling off the bottom of the frame
        const x1 = X(lm[11]), x2 = X(lm[12]), y1 = Y(lm[11]), y2 = Y(lm[12]);
        skx.moveTo(x1, y1); skx.lineTo(x2, y2); skx.lineTo(x2, MASK_H + 5); skx.lineTo(x1, MASK_H + 5); skx.closePath(); skx.fill();
      }
    }
    for (const [a, b, w] of BONES) {
      if (!ok(a, b)) continue;
      skx.lineWidth = sw * w; skx.beginPath(); skx.moveTo(X(lm[a]), Y(lm[a])); skx.lineTo(X(lm[b]), Y(lm[b])); skx.stroke();
    }
    // head: centred between the ears (more stable than the nose)
    if (ok(0)) {
      const hx = ok(7, 8) ? (X(lm[7]) + X(lm[8])) / 2 : X(lm[0]), hy = ok(7, 8) ? (Y(lm[7]) + Y(lm[8])) / 2 : Y(lm[0]);
      skx.beginPath(); skx.ellipse(hx, hy, sw * .3, sw * .38, 0, 0, Math.PI * 2); skx.fill();
    }
    // hands: soft palms
    for (const k of [15, 16]) if (ok(k)) { skx.beginPath(); skx.arc(X(lm[k]), Y(lm[k]), sw * .17, 0, Math.PI * 2); skx.fill(); }
    const d = skx.getImageData(0, 0, MASK_W, MASK_H).data;
    for (let y = 0; y < MASK_H; y++) for (let x = 0; x < MASK_W; x++) {
      const i = y * MASK_W + x, v = d[((MASK_H - 1 - y) * MASK_W + x) * 4] / 255;
      cur[i] = lerp(cur[i], v, .35);
    }
    finishMask();
  }

  // ---------- pose ----------
  const KEY = [0, 11, 12, 13, 14, 15, 16, 23, 24];
  function readPose(now) {
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoT) return;
    lastVideoT = video.currentTime;
    const res = landmarker.detectForVideo(video, now);
    const raw = res.landmarks && res.landmarks[0];
    const mk = res.segmentationMasks && res.segmentationMasks[0];
    let segData = null, segW = 0, segH = 0;
    if (raw && mk) { segData = mk.getAsFloat32Array(); segW = mk.width; segH = mk.height; }
    res.close?.();
    if (!raw) {
      // nobody in view: let the form fade gently instead of vanishing
      S.body.presence = lerp(S.body.presence, 0, .05); S.hands.forEach(h => h.str *= .92); prevLm = null;
      for (let i = 0; i < cur.length; i++) cur[i] *= .93;
      finishMask(); return;
    }
    // smooth every landmark (in screen space), plus a synthetic neck point (33)
    const ts = now / 1000;
    const lm = raw.map((p, i) => {
      const [sx, sy] = toScreen(1 - p.x, 1 - p.y), f = filt[i];
      return { x: f[0](sx, ts), y: f[1](sy, ts), v: f[2](p.visibility ?? 1, ts) };
    });
    lm[33] = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2, v: Math.min(lm[11].v, lm[12].v) };
    // your silhouette: the camera's own cut-out (responsive), lightly steadied;
    // the skeleton form is only a fallback if segmentation isn't available
    if (segData) ingestSeg(segData, segW, segH); else drawForm(lm);
    const P = i => lm[i];
    const dt = prevLm ? Math.max(.016, (now - prevLmT) / 1000) : 0;
    if (prevLm) {
      let s = 0;
      for (const i of KEY) s += Math.hypot(lm[i].x - prevLm[i].x, lm[i].y - prevLm[i].y);
      rawMotion = Math.max(rawMotion, clamp(s / KEY.length / dt / .7, 0, 1));
    }
    prevLm = lm.map(p => ({ x: p.x, y: p.y })); prevLmT = now;

    const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
    S.body.x = lerp(S.body.x, (ls.x + rs.x + lh.x + rh.x) / 4, .25);
    S.body.y = lerp(S.body.y, (ls.y + rs.y + lh.y + rh.y) / 4, .25);
    S.body.presence = lerp(S.body.presence, 1, .1);
    const shoulderY = (ls.y + rs.y) / 2, shoulderW = Math.max(.05, Math.hypot(ls.x - rs.x, ls.y - rs.y));

    let rise = 0;
    [[15, 19], [16, 20]].forEach(([w, f], k) => {
      const a = P(w), b = P(f), h = S.hands[k];
      if (a.v < .4) { h.str *= .85; return; }
      const x = (a.x * 2 + b.x) / 3, y = (a.y * 2 + b.y) / 3;
      const nx = lerp(h.x, x, .6), ny = lerp(h.y, y, .6);
      const sp = dt ? Math.hypot(nx - h.x, ny - h.y) / dt : 0;
      h.vx = nx - h.x; h.vy = ny - h.y; h.x = nx; h.y = ny; h.seen = now;
      h.speed = lerp(h.speed, sp, .4);
      h.stillT = h.speed < .12 ? h.stillT + dt : 0;          // how long this hand has rested
      h.str = lerp(h.str, clamp(.35 + h.speed * .5, 0, 1), .3);
      rise += clamp((a.y - shoulderY) / .25, 0, 1);
    });
    S.rise = lerp(S.rise, rise / 2, .12);
    const span = Math.hypot(S.hands[0].x - S.hands[1].x, S.hands[0].y - S.hands[1].y) / shoulderW;
    S.openness = lerp(S.openness, clamp((span - 1.2) / 2.5, 0, 1), .12);
  }

  // ---------- frame-difference fallback ----------
  const GW = 64, GH = 48, field = new Float32Array(GW * GH);
  function readDiff() {
    if (!video || video.readyState < 2) return;
    if (!diffCtx) { const c = document.createElement('canvas'); c.width = GW; c.height = GH; diffCtx = c.getContext('2d', { willReadFrequently: true }); }
    diffCtx.drawImage(video, 0, 0, GW, GH);
    const d = diffCtx.getImageData(0, 0, GW, GH).data, frame = new Float32Array(GW * GH);
    for (let i = 0; i < frame.length; i++) frame[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    if (prevFrame) {
      let s = 0, sx = 0, sy = 0;
      for (let i = 0; i < frame.length; i++) {
        const df = Math.abs(frame[i] - prevFrame[i]);
        field[i] = Math.max(field[i] * .92, df > .05 ? Math.min(1, df * 5) : 0);
        if (df > .06) { s += df; sx += df * (i % GW); sy += df * ((i / GW) | 0); }
      }
      rawMotion = Math.max(rawMotion, clamp(s / 40, 0, 1));
      if (s > .8) {
        const [x, y] = toScreen(1 - sx / s / GW, 1 - sy / s / GH);
        const h = S.hands[0];
        h.vx = x - h.x; h.vy = y - h.y; h.x = lerp(h.x, x, .2); h.y = lerp(h.y, y, .2);
        h.str = lerp(h.str, clamp(s / 30, .2, 1), .2); h.seen = performance.now();
        S.body.x = lerp(S.body.x, x, .05); S.body.y = lerp(S.body.y, y, .05); S.body.presence = lerp(S.body.presence, 1, .05);
      }
      ingestMask(field, GW, GH, 1.4);
    }
    prevFrame = frame;
  }

  // ---------- per-frame ----------
  function update(dt, now) {
    if (S.source === 'pose') readPose(now);
    else if (S.source === 'motion') readDiff();

    S.motion = lerp(S.motion, rawMotion, rawMotion > S.motion ? .25 : .05);
    rawMotion *= .5;

    // stillness fills over ~7 s of calm, drains faster when you move
    const calm = S.motion < .12;
    S.stillness = clamp(S.stillness + (calm ? dt / 7 : -dt / 2.2 * (S.motion * 3)), 0, 1);
    if (S.stillness >= 1 && !charged) { charged = true; S.pulse = 1; S.rewards++; }
    if (S.stillness < .6) charged = false;
    S.pulse = Math.max(0, S.pulse - dt / 4);

    for (const h of S.hands) { if (now - h.seen > 600) h.str *= .94; h.speed *= .92; }
    if (S.source === 'pointer' && now - pointerT > 4000) S.body.presence *= .98;
    if (S.source !== 'pose') { S.rise *= .98; S.openness *= .98; }
  }

  // testForm: draw the form from given landmarks (screen space), for testing without a camera
  return { state: S, update, startCamera, edgePoint, testForm: lm => { S.maskOn = true; drawForm(lm); }, get video() { return video; } };
}
