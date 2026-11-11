// Audio in: album files (clean signal) or the mic (Spotify / speakers in the room).
// Produces:
//   lv        smoothed bass / mid / high / level, a soft beat
//   spectrum  64 log-spaced bands (40 Hz - 12 kHz), 0..1, as bytes for the GPU
//   onsets    sudden rises per band group (attacks: plucks, hits, swells), these make waves
//   mood      slow energy + brightness, used by Auto mode

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BANDS = 64;

export function createAudio() {
  let ctx = null, analyser = null, freq = null, el = null, mode = 'idle';
  const lv = { bass: 0, mid: 0, high: 0, level: 0, beat: 0, centroid: .3 };
  const mood = { energy: .3, brightness: .3 };
  const spectrum = new Uint8Array(BANDS * 4);       // RGBA texture row
  const bands = new Float32Array(BANDS), prevBands = new Float32Array(BANDS);
  const onsets = { low: 0, mid: 0, high: 0 };
  // seven slow bands, lows -> highs: what the worlds visibly follow.
  // rise over ~1s, fall over ~3s, so the picture breathes with the music instead of flickering
  const bands7 = new Float32Array(7);
  const B7 = [0, 7, 14, 22, 31, 41, 52, 64];
  // and a slow version of the main levels
  const soft = { bass: 0, mid: 0, high: 0, level: 0 };
  let edges = null, bassAvg = .3, gain = 1;
  const lastHit = { low: 0, mid: 0, high: 0 };
  // an attack only counts if it clears a threshold, and each band rests briefly after firing
  const pick = (k, flux, thr, scale, t) => {
    if (flux < thr || t - lastHit[k] < .14) return 0;
    lastHit[k] = t; return clamp((flux - thr) * scale, .15, 1);
  };

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = .7;
      freq = new Uint8Array(analyser.frequencyBinCount);
      const hz = ctx.sampleRate / analyser.fftSize;
      edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(40 * Math.pow(12000 / 40, i / BANDS) / hz)));
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function element() {
    ensure();
    if (!el) { el = new Audio(); const src = ctx.createMediaElementSource(el); src.connect(analyser); src.connect(ctx.destination); }
    mode = 'file';
    return el;
  }
  async function startMic() {
    ensure();
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ctx.createMediaStreamSource(s).connect(analyser);
    mode = 'mic';
  }

  // Desktop browsers only: capture a tab's or the whole system's sound directly
  // (e.g. Spotify's web player in another tab). Clean signal, no room noise.
  async function startCapture() {
    ensure();
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: true, systemAudio: 'include', selfBrowserSurface: 'exclude',
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (!s.getAudioTracks().length) { s.getTracks().forEach(t => t.stop()); throw new Error('noaudio'); }
    ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(analyser);
    s.getAudioTracks()[0].addEventListener('ended', () => { if (mode === 'capture') mode = 'idle'; });
    mode = 'capture';
  }
  const canCapture = !!navigator.mediaDevices?.getDisplayMedia && !/iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
    && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function update(t) {
    const live = analyser && (mode === 'mic' || mode === 'capture' || (mode === 'file' && el && !el.paused));
    if (live) {
      analyser.getByteFrequencyData(freq);
      let peak = 0;
      for (let b = 0; b < BANDS; b++) {
        const a = edges[b], z = Math.max(a + 1, edges[b + 1]);
        let s = 0; for (let i = a; i < z; i++) s += freq[i];
        // gentle tilt so highs aren't drowned by the lows
        const v = s / (z - a) / 255 * (1 + b / BANDS * .8);
        bands[b] = v; peak = Math.max(peak, v);
      }
      // slow auto-gain: quiet rooms (mic) and loud files both fill the range
      gain = lerp(gain, clamp(.75 / Math.max(peak, .05), .8, mode === 'mic' ? 4 : 1.6), .01);
    } else {
      // breathing when nothing's playing
      for (let b = 0; b < BANDS; b++) bands[b] = .18 + .12 * Math.sin(t * (.4 + b * .013) + b * .5) * (1 - b / BANDS * .6);
      gain = 1;
    }
    let lo = 0, mi = 0, hi = 0, oLo = 0, oMi = 0, oHi = 0;
    for (let b = 0; b < BANDS; b++) {
      const v = clamp(bands[b] * gain, 0, 1);
      const flux = Math.max(0, v - prevBands[b]);
      prevBands[b] = lerp(prevBands[b], v, .5);
      spectrum[b * 4] = lerp(spectrum[b * 4], v * 255, v * 255 > spectrum[b * 4] ? .6 : .15);
      spectrum[b * 4 + 3] = 255;
      if (b < 14) { lo += v; oLo += flux; } else if (b < 40) { mi += v; oMi += flux; } else { hi += v; oHi += flux; }
    }
    lo /= 14; mi /= 26; hi /= 24;
    for (let k = 0; k < 7; k++) {
      let v = 0; for (let b = B7[k]; b < B7[k + 1]; b++) v += spectrum[b * 4] / 255;
      v /= B7[k + 1] - B7[k];
      bands7[k] = lerp(bands7[k], v, v > bands7[k] ? .05 : .018);
    }
    onsets.low = live ? pick('low', oLo / 14, .045, 8, t) : 0;
    onsets.mid = live ? pick('mid', oMi / 26, .035, 10, t) : 0;
    onsets.high = live ? pick('high', oHi / 24, .03, 12, t) : 0;
    lv.bass = lerp(lv.bass, lo, .14); lv.mid = lerp(lv.mid, mi, .1); lv.high = lerp(lv.high, hi, .16);
    lv.level = lerp(lv.level, clamp((lo + mi + hi) / 1.8, 0, 1), .06);
    let num = 0, den = 0;
    for (let b = 0; b < BANDS; b++) { num += b * spectrum[b * 4]; den += spectrum[b * 4]; }
    lv.centroid = lerp(lv.centroid, den ? num / den / BANDS : .3, .05);
    bassAvg = lerp(bassAvg, lv.bass, .015);
    lv.beat = lerp(lv.beat, clamp((lv.bass - bassAvg - .035) * 6, 0, 1), .35);
    soft.bass = lerp(soft.bass, lv.bass, .03); soft.mid = lerp(soft.mid, lv.mid, .03);
    soft.high = lerp(soft.high, lv.high, .04); soft.level = lerp(soft.level, lv.level, .02);
    mood.energy = lerp(mood.energy, lv.level, .004);
    mood.brightness = lerp(mood.brightness, clamp(lv.centroid * 2.2, 0, 1), .004);
    return live;
  }

  return { lv, mood, spectrum, onsets, bands7, soft, update, element, startMic, startCapture, canCapture, ensure, get mode() { return mode; }, get el() { return el; } };
}
