import { createGL, program, drawQuad, texture, QUAD_VERT } from './gl.js';
import { WORLD_FRAG } from './shader.js';
import { createSim } from './sim.js';
import { createBody, MASK_W, MASK_H } from './body.js';
import { createAudio, BANDS } from './audio.js';
import { createParticles, WORLD_TINT } from './particles.js';
import { createLights } from './lights.js';
import { createSpotify } from './spotify.js';
import { WORLDS, worldForTrack, worldForMood } from './tracks.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const say = m => { $('status').textContent = m; };

// ---------- GPU ----------
const glc = $('gl');
const G = createGL(glc);
if (!G) { say('This browser has no WebGL2, so Stillwater can\'t run here.'); throw new Error('no webgl2'); }
const { gl } = G;
const sim = createSim(gl, G.floatTargets);
const W_ = program(gl, QUAD_VERT, WORLD_FRAG), U = W_.U;
const specTex = texture(gl, BANDS, 1, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
const maskTex = texture(gl, MASK_W, MASK_H, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
const zeroTex = texture(gl, 1, 1, { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array(4) });

// the worlds are soft, so render below screen resolution. Q cycles quality.
const QUALITY = [.5, .7, 1];
let q = 1;
try { q = +(localStorage.getItem('sw-quality') ?? 1); } catch {}
const particles = createParticles($('fx'));
let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2), s = QUALITY[q] * Math.min(dpr, 1.5);
  glc.width = Math.round(W * s); glc.height = Math.round(H * s);
  particles.resize(W, H, Math.min(dpr, 1.5));
}
addEventListener('resize', resize); resize();

// ---------- state ----------
const body = createBody();
const audio = createAudio();
const lights = createLights();
let cur = 0, prev = 0, fade = 1, sceneStart = performance.now();
let auto = false, playlist = [], trackIdx = 0, nowPlaying = null;

const titleEl = $('title'); let titleTimer;
function setWorld(i, label, sub) {
  if (i !== cur) { prev = cur; cur = i; fade = 0; }
  sceneStart = performance.now();
  document.querySelectorAll('#worlds button').forEach((b, j) => b.classList.toggle('on', j === i));
  titleEl.innerHTML = '';
  titleEl.append(label || WORLDS[i].name);
  const small = document.createElement('small'); small.textContent = sub || WORLDS[i].sub; titleEl.append(small);
  const hint = document.createElement('em'); hint.textContent = WORLDS[i].hint; titleEl.append(hint);
  titleEl.style.opacity = 1;
  clearTimeout(titleTimer); titleTimer = setTimeout(() => titleEl.style.opacity = 0, 7000);
}
WORLDS.forEach((w, i) => {
  const b = document.createElement('button'); b.textContent = `${i + 1} ${w.name}`;
  b.onclick = () => { setAuto(false); setWorld(i); }; $('worlds').appendChild(b);
});
function setAuto(on) {
  auto = on; $('auto').classList.toggle('on', on);
  if (on) say('Auto: the world follows the song (Spotify title or file name), or how the music sounds when the title doesn\'t match.');
}
$('auto').onclick = () => setAuto(!auto);

// ---------- album files ----------
const cleanName = f => f.name.replace(/\.[^.]+$/, '').replace(/^[\d\s.\-_]+/, '');
function playTrack(i) {
  if (!playlist.length) return;
  trackIdx = (i + playlist.length) % playlist.length;
  const el = audio.element();
  if (el.src) URL.revokeObjectURL(el.src);
  el.src = URL.createObjectURL(playlist[trackIdx]);
  el.onended = () => playTrack(trackIdx + 1);
  el.play().catch(() => say('Tap anywhere, then press Space to play.'));
  const name = cleanName(playlist[trackIdx]);
  const w = worldForTrack(name);
  setWorld(w >= 0 ? w : auto ? worldForMood(audio.mood) : trackIdx % WORLDS.length, name);
}
$('file').addEventListener('change', e => {
  const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return;
  playlist = files; playTrack(0);
  say(`${files.length} track${files.length > 1 ? 's' : ''} loaded. Each title picks its world. Space pauses, → skips.`);
});

// ---------- mic / camera / fullscreen ----------
async function startMic() {
  try {
    await audio.startMic(); $('mic').classList.add('on');
    say(spotify.connected ? 'Listening. Spotify picks the world, the mic moves the water.' : 'Listening to the room. Play music through your speakers.');
  } catch { say('Couldn\'t start the mic. Allow microphone access for this page.'); }
}
$('mic').onclick = startMic;
if (audio.canCapture) $('tab').style.display = '';
$('tab').onclick = async () => {
  try {
    await audio.startCapture(); $('tab').classList.add('on');
    say('Listening to that tab directly. Keep the music tab open.');
  } catch (e) {
    say(e.message === 'noaudio'
      ? 'No sound came through. Pick a tab (e.g. open.spotify.com) and switch on "Share tab audio", or share the whole screen with "Share system audio".'
      : 'Audio capture was cancelled.');
  }
};
$('cam').onclick = async () => {
  try { await body.startCamera(say); $('cam').classList.add('on'); }
  catch { say('Couldn\'t start the camera. Allow camera access for this page.'); }
};
$('fs').onclick = () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { say('For fullscreen on iPhone/iPad: Share → Add to Home Screen.'); return; }
  const r = req.call(el); r?.catch?.(() => say('For fullscreen on iPhone/iPad: Share → Add to Home Screen.'));
};

// ---------- Spotify ----------
const spotify = createSpotify({
  onStatus: say,
  onTrack: t => {
    nowPlaying = t;
    $('np').textContent = t ? `${t.playing ? '♪' : '❚❚'} ${t.name} · ${t.artists}` : '';
    if (!t || !t.changed) return;
    const w = worldForTrack(t.name);
    if (w >= 0) setWorld(w, t.name, t.artists);
    else if (auto) setWorld(worldForMood(audio.mood), t.name, t.artists);
    else setWorld(cur, t.name, t.artists);
    if (audio.mode !== 'mic') say('Spotify connected. Tap "Listen (mic)" so the visuals can hear the music too.');
  },
});
const panel = $('sp-panel');
$('sp-redirect').textContent = spotify.redirectUri();
$('sp').onclick = () => {
  if (spotify.connected) { spotify.disconnect(); $('sp').classList.remove('on'); $('np').textContent = ''; say('Spotify disconnected.'); return; }
  if (spotify.clientId()) { spotify.login(); return; }
  panel.classList.add('show');
};
$('sp-go').onclick = () => {
  const id = $('sp-id').value.trim();
  if (!/^[0-9a-f]{32}$/i.test(id)) { $('sp-id').focus(); $('sp-err').textContent = 'That doesn\'t look like a Client ID (32 letters/numbers).'; return; }
  spotify.setClientId(id); spotify.login();
};
$('sp-close').onclick = () => panel.classList.remove('show');
$('sp-copy').onclick = () => navigator.clipboard?.writeText(spotify.redirectUri()).then(() => $('sp-copy').textContent = 'Copied');
(async () => {
  const qp = new URLSearchParams(location.search);
  if (qp.get('spotify')) spotify.setClientId(qp.get('spotify'));
  try { await spotify.handleRedirect(); } catch (e) { say('Spotify sign-in didn\'t finish. Check the Redirect URI matches exactly, then try again.'); }
  if (spotify.connected) { spotify.start(); $('sp').classList.add('on'); say('Spotify connected. Tap "Listen (mic)" so the visuals hear the music too.'); }
})();

// ---------- camera preview, keys, idle UI ----------
let preview = false;
function togglePreview() {
  preview = !preview;
  const pv = $('preview');
  if (preview && body.video) { pv.srcObject = body.video.srcObject; pv.play(); }
  pv.style.display = preview && body.video ? 'block' : 'none';
}
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= String(WORLDS.length)) { setAuto(false); setWorld(+e.key - 1); }
  else if (e.key === 'f') $('fs').click();
  else if (e.key === 'a') setAuto(!auto);
  else if (e.key === 'c') $('cam').click();
  else if (e.key === 'm') startMic();
  else if (e.key === 'p') togglePreview();
  else if (e.key === 'd') $('debug').classList.toggle('show');
  else if (e.key === 'q') { q = (q + 1) % QUALITY.length; try { localStorage.setItem('sw-quality', q); } catch {} resize(); say(`Quality ${['low', 'medium', 'high'][q]}`); }
  else if (e.key === ' ' && audio.el) { e.preventDefault(); audio.el.paused ? audio.el.play() : audio.el.pause(); }
  else if (e.key === 'ArrowRight' && playlist.length) playTrack(trackIdx + 1);
  else if (e.key === 'ArrowLeft' && playlist.length) playTrack(trackIdx - 1);
  else if (e.key === 'h') ui.classList.toggle('hide');
});
const ui = $('ui'); let idle;
function wake() { ui.classList.remove('hide'); document.body.classList.remove('nocursor'); clearTimeout(idle); idle = setTimeout(() => { if (!panel.classList.contains('show')) { ui.classList.add('hide'); document.body.classList.add('nocursor'); } }, 6000); }
['pointermove', 'pointerdown', 'keydown'].forEach(ev => addEventListener(ev, wake)); wake();

// ---------- physics: how sound, hands and body move the sheet ----------
// Calm by design: the music feeds slow, broad swells from its low end (no
// random splashes); your hands and body add gentle wakes and currents.
function sources(world, t) {
  const A = audio.soft, S = body.state, src = [];
  const ASP = W / H;
  const hands = S.hands.filter(h => h.str > .08);
  const wake = h => h.str * Math.min(h.speed, 2) * Math.sin(t * 3.5);
  if (world === 0) {
    // lows: long swells rolling in from the far sea
    for (let i = 0; i < 3; i++) src.push([.2 + i * .3, .92, .09, A.bass * .035 * Math.sin(t * .9 + i * 2.1)]);
    for (const h of hands) {
      const z = 1 + h.y * 3, x = (h.x - .5) * ASP * z;
      src.push([x / 9 + .5, (z - .8) / 12, .02, wake(h) * .12]);
    }
  } else if (world === 1) {
    const bx = Math.sin(t * .04) * .12 + (S.body.x - .5) * ASP * .35 * S.body.presence;
    src.push([bx / ASP + .5, .44, .05, A.bass * .05 * Math.sin(t * 1.4)]);
  } else if (world === 2) {
    src.push([.5, 1.0, .25, A.bass * .03 * Math.sin(t * .7)]);           // slow swell from the surface
    for (const h of hands) src.push([h.x, h.y, .03, wake(h) * .08]);      // hands stir currents
  } else if (world === 4) {
    const c = S.body.presence > .3 ? [S.body.x, .5 + (S.body.y - .5) * .5] : [.5, .48];
    src.push([c[0], c[1], .06, A.bass * .05 * Math.sin(t * 1.2)]);
    for (const h of hands) src.push([h.x, h.y, .025, wake(h) * .06]);
  }
  return src;
}
// damping, how hard your moving body pushes, whether it blocks waves, and wave speed (steps/frame)
const PHYS = [
  { damp: .992, push: 0, obstacle: 0, iters: 2 },     // tide: the sea is its own plane, you're on the shore
  { damp: .97, push: .2, obstacle: 0, iters: 1 },     // lightwell: air, settles quickly
  { damp: .985, push: .35, obstacle: .7, iters: 1 },  // undertow: water moves slowly around you
  { damp: .97, push: 0, obstacle: 0, iters: 1 },      // prism: no sheet
  { damp: .975, push: .25, obstacle: .3, iters: 1 },  // bloom: a soft membrane
];

// ---------- Bloom: rest a hand somewhere to plant a flower there ----------
let flowers = [];
const flowerArr = new Float32Array(32);
function tendFlowers(dt) {
  const S = body.state;
  if (cur === 4) for (const h of S.hands) {
    if (h.str < .2 || h.stillT < 1.2) continue;
    const near = flowers.some(f => Math.hypot((f.x - h.x) * W / H, f.y - h.y) < .07);
    if (!near) { flowers.push({ x: h.x, y: h.y, g: 0, hue: Math.random(), age: 0 }); h.stillT = -2; }
  }
  for (const f of flowers) { f.age += dt; f.g = Math.min(1, f.age / 5) * (f.age > 70 ? Math.max(0, 1 - (f.age - 70) / 10) : 1); }
  flowers = flowers.filter(f => f.age < 80).slice(-8);
  flowerArr.fill(0);
  flowers.forEach((f, i) => flowerArr.set([f.x, f.y, f.g, f.hue], i * 4));
}

// ---------- loop ----------
const dbg = $('debug');
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  body.update(dt, now);
  const live = audio.update(t);
  const S = body.state, A = audio.lv;

  if (auto && live && now - sceneStart > 40000 && !(nowPlaying && worldForTrack(nowPlaying.name) >= 0)) {
    const w = worldForMood(audio.mood);
    if (w !== cur) setWorld(w);
  }
  fade = Math.min(1, fade + dt / 6);

  // textures in
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BANDS, 1, gl.RGBA, gl.UNSIGNED_BYTE, audio.spectrum);
  if (S.maskDirty) {
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MASK_W, MASK_H, gl.RGBA, gl.UNSIGNED_BYTE, S.mask);
    S.maskDirty = false;
  }

  // physics
  if (sim) {
    const P = PHYS[cur];
    sim.step(sources(cur, t), { maskTex, maskOn: S.maskOn && cur !== 0, camMap: S.camMap, maskPush: P.push, obstacle: P.obstacle, damp: cur === 0 ? P.damp + S.stillness * .006 : P.damp, aspect: cur === 0 ? 1.5 : W / H }, P.iters);
  }

  // world
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, glc.width, glc.height);
  gl.useProgram(W_.p);
  gl.uniform2f(U.uRes, glc.width, glc.height);
  gl.uniform1f(U.uTime, t % 3600);
  const SA = audio.soft;
  gl.uniform4f(U.uAudio, SA.bass, SA.mid, SA.high, SA.level);
  gl.uniform1fv(U.uBands7, audio.bands7);
  tendFlowers(dt);
  gl.uniform4fv(U.uFlowers, flowerArr); gl.uniform1i(U.uNFlowers, flowers.length);
  const h0 = S.hands[0], h1 = S.hands[1];
  gl.uniform3f(U.uH0, h0.x, h0.y, h0.str > .03 ? h0.str : 0);
  gl.uniform3f(U.uH1, h1.x, h1.y, h1.str > .03 ? h1.str : 0);
  gl.uniform3f(U.uBody, S.body.x, S.body.y, S.body.presence > .05 ? S.body.presence : 0);
  gl.uniform4f(U.uMove, S.motion, S.stillness, S.rise, S.openness);
  gl.uniform1f(U.uPulse, S.pulse);
  gl.uniform1i(U.uA, cur); gl.uniform1i(U.uB, prev); gl.uniform1f(U.uFade, fade);
  gl.uniform1i(U.uSimOn, sim ? 1 : 0);
  gl.uniform1i(U.uMaskOn, S.maskOn ? 1 : 0);
  gl.uniform2f(U.uCamMap, S.camMap[0], S.camMap[1]);
  gl.uniform2f(U.uSimTexel, sim ? 1 / sim.W : 0, sim ? 1 / sim.H : 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim ? sim.tex : zeroTex); gl.uniform1i(U.uSim, 0);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.uniform1i(U.uMask, 3);
  drawQuad(gl);

  particles.step(cur, S, audio, t);

  const [r, g, b] = WORLD_TINT[cur];
  lights.update(now, { type: 'light', r, g, b, brightness: clamp(.35 + A.level * .5 + S.stillness * .15 + A.beat * .2, 0, 1), world: WORLDS[cur].id, beat: A.beat, stillness: S.stillness });

  frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  if (dbg.classList.contains('show')) {
    const f = v => v.toFixed(2), O = audio.onsets;
    dbg.textContent = `fps ${fps}  input ${S.source}  audio ${audio.mode}  physics ${sim ? 'on' : 'off'}  spotify ${spotify.connected ? 'on' : 'off'}\n` +
      `motion ${f(S.motion)}  still ${f(S.stillness)}  rise ${f(S.rise)}  open ${f(S.openness)}  rewards ${S.rewards}\n` +
      `bass ${f(A.bass)}  mid ${f(A.mid)}  high ${f(A.high)}  beat ${f(A.beat)}  attacks ${f(O.low)}/${f(O.mid)}/${f(O.high)}\n` +
      `energy ${f(audio.mood.energy)}  bright ${f(audio.mood.brightness)}  hands ${f(h0.str)}/${f(h1.str)}  lights ${lights.bridged ? 'bridged' : 'local'}`;
  }
  requestAnimationFrame(frame);
}
if (new URLSearchParams(location.search).has('test')) window.__sw = { body, setWorld, skipFade: () => { fade = 1; } };
setWorld(0);
requestAnimationFrame(frame);
