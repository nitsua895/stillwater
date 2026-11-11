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
  titleEl.style.opacity = 1;
  clearTimeout(titleTimer); titleTimer = setTimeout(() => titleEl.style.opacity = 0, 5000);
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

// ---------- physics sources: how sound, hands and body push the sheet ----------
// Every world gets energy from the music in its own way. Sustained sound makes
// slow swells; attacks (onsets) drop sharp ripples that travel and interfere.
function sources(world, t) {
  const A = audio.lv, O = audio.onsets, S = body.state, src = [];
  const ASP = W / H;
  const hands = S.hands.filter(h => h.str > .08);
  if (world === 0) {
    // swells roll in from the far sea on the low end
    for (let i = 0; i < 4; i++) src.push([.15 + i * .23, .9, .06, A.bass * .05 * Math.sin(t * 1.5 + i * 1.7)]);
    if (O.high) src.push([rand(.25, .75), rand(.05, .6), .007, -O.high * .5]);   // drops on the surface
    if (O.mid) src.push([rand(.3, .7), rand(.2, .7), .014, O.mid * .35]);
    for (const h of hands) {
      const z = 1 + h.y * 3, x = (h.x - .5) * ASP * z;
      src.push([x / 9 + .5, (z - .8) / 12, .012, h.str * Math.min(h.speed, 2.5) * .35 * Math.sin(t * 7)]);
    }
    if (S.body.presence > .3) src.push([(S.body.x - .5) * ASP / 9 + .5, .025, .02, S.motion * .4 * Math.sin(t * 5)]);
    return src;
  }
  if (world === 1) {
    const bx = Math.sin(t * .06) * .12 + (S.body.x - .5) * ASP * .35 * S.body.presence;
    src.push([bx / ASP + .5, .44 + S.rise * .08, .02, A.bass * .2 * Math.sin(t * 3) + O.low * .5]);
    if (O.mid) src.push([bx / ASP + .5 + rand(-.05, .05), rand(.5, .95), .01, O.mid * .4]);
  } else if (world === 2) {
    src.push([.5, .04, .1, A.bass * .12 * Math.sin(t * 1.3)]);                          // deep thrum
    if (O.high) src.push([rand(.1, .9), rand(.75, .98), .008, O.high * .6]);       // drips from the surface
    if (O.mid) src.push([rand(.2, .8), rand(.3, .8), .015, O.mid * .4]);
  } else if (world === 3) {
    if (O.low) src.push([rand(.15, .85), rand(.2, .8), .02, O.low * .5]);           // a pane is struck
    if (O.high) src.push([rand(.1, .9), rand(.1, .9), .007, O.high * .3]);
    src.push([.5, .5, .08, A.bass * .05 * Math.sin(t * 2)]);
  } else {
    const c = S.body.presence > .3 ? [S.body.x, .5 + (S.body.y - .5) * .5] : [.5, .48];
    src.push([c[0], c[1], .04, A.bass * .15 * Math.sin(t * 2.4) + O.low * .4]);
    if (O.high) { const a = rand(0, 6.28), r = rand(.08, .2); src.push([c[0] + Math.cos(a) * r / ASP, c[1] + Math.sin(a) * r, .008, O.high * .4]); }
  }
  for (const h of hands) src.push([h.x, h.y, .014, h.str * Math.min(h.speed, 2.5) * .3 * Math.sin(t * 7)]);
  return src;
}
// how each world's sheet behaves: damping, and whether your body blocks / shoves it
const PHYS = [
  { damp: .992, push: 0, obstacle: 0 },      // tide: the sea is its own plane; you're on the shore
  { damp: .975, push: .6, obstacle: 0 },     // lightwell: air, quick to settle
  { damp: .99, push: 1.2, obstacle: .9 },    // undertow: water flows around you and you shove it
  { damp: .985, push: .8, obstacle: .6 },    // prism: glass rings and reflects off your window
  { damp: .978, push: .7, obstacle: .3 },    // bloom: a soft membrane
];

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
    sim.step(sources(cur, t), { maskTex, maskOn: S.maskOn && cur !== 0, camMap: S.camMap, maskPush: P.push, obstacle: P.obstacle, damp: P.damp, aspect: cur === 0 ? 1.5 : W / H });
  }

  // world
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, glc.width, glc.height);
  gl.useProgram(W_.p);
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
  gl.uniform1i(U.uSimOn, sim ? 1 : 0);
  gl.uniform1i(U.uMaskOn, S.maskOn ? 1 : 0);
  gl.uniform2f(U.uCamMap, S.camMap[0], S.camMap[1]);
  gl.uniform2f(U.uSimTexel, sim ? 1 / sim.W : 0, sim ? 1 / sim.H : 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sim ? sim.tex : zeroTex); gl.uniform1i(U.uSim, 0);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, specTex); gl.uniform1i(U.uSpec, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.uniform1i(U.uMask, 3);
  drawQuad(gl);

  particles.step(cur, S, A, t);

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
setWorld(0);
requestAnimationFrame(frame);
