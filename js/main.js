import { VERT, FRAG } from './shader.js';
import { createBody } from './body.js';
import { createAudio } from './audio.js';
import { createParticles, WORLD_TINT } from './particles.js';
import { createLights } from './lights.js';
import { WORLDS, worldForTrack, worldForMood } from './tracks.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const statusEl = $('status');
const say = m => { statusEl.textContent = m; };

// ---------- WebGL ----------
const glc = $('gl');
const gl = glc.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
if (!gl) { say('This browser has no WebGL, so Stillwater can\'t run here.'); throw new Error('no webgl'); }
function sh(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
const U = {};
['uRes', 'uTime', 'uAudio', 'uBeat', 'uH0', 'uH1', 'uBody', 'uMove', 'uPulse', 'uA', 'uB', 'uFade'].forEach(n => U[n] = gl.getUniformLocation(prog, n));

// render the shader below screen resolution: these worlds are soft, and it keeps
// projectors / laptops smooth. Q cycles quality.
const QUALITY = [.5, .7, 1];
let q = 1;
try { q = +(localStorage.getItem('sw-quality') ?? 1); } catch {}
const pcv = $('fx');
const particles = createParticles(pcv);
let W = 0, H = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2), s = QUALITY[q] * Math.min(dpr, 1.5);
  glc.width = Math.round(W * s); glc.height = Math.round(H * s);
  gl.viewport(0, 0, glc.width, glc.height);
  particles.resize(W, H, Math.min(dpr, 1.5));
}
addEventListener('resize', resize); resize();

// ---------- state ----------
const body = createBody();
const audio = createAudio();
const lights = createLights();
let cur = 0, prev = 0, fade = 1, sceneStart = performance.now();
let auto = false, playlist = [], trackIdx = 0;

const titleEl = $('title'); let titleTimer;
function setWorld(i, label, quiet) {
  if (i !== cur) { prev = cur; cur = i; fade = 0; }
  sceneStart = performance.now();
  document.querySelectorAll('#worlds button').forEach((b, j) => b.classList.toggle('on', j === i));
  if (quiet) return;
  titleEl.innerHTML = `${label || WORLDS[i].name}<small>${WORLDS[i].sub}</small>`;
  titleEl.style.opacity = 1;
  clearTimeout(titleTimer); titleTimer = setTimeout(() => titleEl.style.opacity = 0, 5000);
}
const wbox = $('worlds');
WORLDS.forEach((w, i) => {
  const b = document.createElement('button'); b.textContent = `${i + 1} ${w.name}`;
  b.onclick = () => { setAuto(false); setWorld(i); }; wbox.appendChild(b);
});

function setAuto(on) {
  auto = on; $('auto').classList.toggle('on', on);
  if (on) say('Auto: the world follows how the music sounds (experimental). Loaded tracks still use their own world when the name matches.');
}
$('auto').onclick = () => setAuto(!auto);

// ---------- audio controls ----------
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
$('mic').onclick = async () => {
  try {
    await audio.startMic(); $('mic').classList.add('on');
    say('Listening to the room. Play the soundtrack from Spotify or your speakers. Turn on Auto to let the music choose the world.');
  } catch { say('Couldn\'t start the mic. Allow microphone access for this page, or load the album files instead.'); }
};
$('cam').onclick = async () => {
  try { await body.startCamera(say); $('cam').classList.add('on'); }
  catch { say('Couldn\'t start the camera. Allow camera access for this page (it needs HTTPS or localhost).'); }
};
$('fs').onclick = () => {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { say('For fullscreen on iPad: Share → Add to Home Screen.'); return; }
  const r = req.call(el); r?.catch?.(() => say('For fullscreen on iPad: Share → Add to Home Screen.'));
};

// ---------- camera preview (mirror) ----------
let preview = false;
const pv = $('preview');
function togglePreview() {
  preview = !preview;
  if (preview && body.video) { pv.srcObject = body.video.srcObject; pv.play(); }
  pv.style.display = preview && body.video ? 'block' : 'none';
}

// ---------- keyboard ----------
addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= String(WORLDS.length)) { setAuto(false); setWorld(+e.key - 1); }
  else if (e.key === 'f') $('fs').click();
  else if (e.key === 'a') setAuto(!auto);
  else if (e.key === 'c') $('cam').click();
  else if (e.key === 'p') togglePreview();
  else if (e.key === 'd') $('debug').classList.toggle('show');
  else if (e.key === 'q') { q = (q + 1) % QUALITY.length; try { localStorage.setItem('sw-quality', q); } catch {} resize(); say(`Quality ${['low', 'medium', 'high'][q]}`); }
  else if (e.key === ' ' && audio.el) { e.preventDefault(); audio.el.paused ? audio.el.play() : audio.el.pause(); }
  else if (e.key === 'ArrowRight' && playlist.length) playTrack(trackIdx + 1);
  else if (e.key === 'ArrowLeft' && playlist.length) playTrack(trackIdx - 1);
  else if (e.key === 'h') ui.classList.toggle('hide');
});
const ui = $('ui'); let idle;
function wake() { ui.classList.remove('hide'); document.body.classList.remove('nocursor'); clearTimeout(idle); idle = setTimeout(() => { ui.classList.add('hide'); document.body.classList.add('nocursor'); }, 5000); }
['pointermove', 'pointerdown', 'keydown'].forEach(ev => addEventListener(ev, wake)); wake();

// ---------- loop ----------
const dbg = $('debug');
let last = performance.now(), frames = 0, fpsT = last, fps = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  body.update(dt, now);
  const live = audio.update(t);
  const S = body.state, A = audio.lv;

  // auto mood: only drifts after a world has had its moment (40s)
  if (auto && live && now - sceneStart > 40000) {
    const w = worldForMood(audio.mood);
    if (w !== cur) setWorld(w);
  }
  fade = Math.min(1, fade + dt / 6);

  gl.uniform2f(U.uRes, glc.width, glc.height);
  gl.uniform1f(U.uTime, t % 3600);
  gl.uniform4f(U.uAudio, A.bass, A.mid, A.high, A.level);
  gl.uniform1f(U.uBeat, A.beat);
  const h0 = S.hands[0], h1 = S.hands[1];
  gl.uniform3f(U.uH0, h0.x, h0.y, h0.str > .03 ? h0.str : 0);
  gl.uniform3f(U.uH1, h1.x, h1.y, h1.str > .03 ? h1.str : 0);
  gl.uniform3f(U.uBody, S.body.x, S.body.y, S.body.presence > .05 ? S.body.presence : 0);
  gl.uniform4f(U.uMove, S.motion, S.stillness, S.rise, S.openness);
  gl.uniform1f(U.uPulse, S.pulse);
  gl.uniform1i(U.uA, cur); gl.uniform1i(U.uB, prev); gl.uniform1f(U.uFade, fade);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  particles.step(cur, S, A, t);

  const [r, g, b] = WORLD_TINT[cur];
  lights.update(now, { type: 'light', r, g, b, brightness: clamp(.35 + A.level * .5 + S.stillness * .15 + A.beat * .2, 0, 1), world: WORLDS[cur].id, beat: A.beat, stillness: S.stillness });

  frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  if (dbg.classList.contains('show')) {
    const f = v => v.toFixed(2);
    dbg.textContent = `fps ${fps}  input ${S.source}  audio ${audio.mode}\n` +
      `motion ${f(S.motion)}  still ${f(S.stillness)}  rise ${f(S.rise)}  open ${f(S.openness)}  rewards ${S.rewards}\n` +
      `bass ${f(A.bass)}  mid ${f(A.mid)}  high ${f(A.high)}  beat ${f(A.beat)}  energy ${f(audio.mood.energy)}  bright ${f(audio.mood.brightness)}\n` +
      `hands ${f(h0.str)} / ${f(h1.str)}  lights ${lights.bridged ? 'bridged' : 'local'}`;
  }
  requestAnimationFrame(frame);
}
setWorld(0);
requestAnimationFrame(frame);
