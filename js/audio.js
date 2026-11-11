// Audio in: local album files (best: clean signal + track names) or the mic
// (for Spotify / speakers in the room). Produces smoothed bands, a soft beat,
// and a slow "mood" (energy + brightness) used by Auto mode.

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createAudio() {
  let ctx = null, analyser = null, freq = null, el = null, mode = 'idle';
  const lv = { bass: 0, mid: 0, high: 0, level: 0, beat: 0, centroid: .3 };
  const mood = { energy: .3, brightness: .3 };
  let bassAvg = .3;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = .8;
      freq = new Uint8Array(analyser.frequencyBinCount);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function element() {
    ensure();
    if (!el) {
      el = new Audio();
      const src = ctx.createMediaElementSource(el);
      src.connect(analyser); src.connect(ctx.destination);
    }
    mode = 'file';
    return el;
  }

  async function startMic() {
    ensure();
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    ctx.createMediaStreamSource(s).connect(analyser);
    mode = 'mic';
  }

  // average of bins between two frequencies (Hz)
  function band(f0, f1) {
    const hz = ctx.sampleRate / analyser.fftSize;
    const a = Math.max(1, Math.round(f0 / hz)), b = Math.max(a + 1, Math.round(f1 / hz));
    let s = 0; for (let i = a; i < b; i++) s += freq[i];
    return s / (b - a) / 255;
  }

  function update(t) {
    const live = analyser && (mode === 'mic' || (mode === 'file' && el && !el.paused));
    let b, m, h, c;
    if (live) {
      analyser.getByteFrequencyData(freq);
      b = band(30, 160); m = band(160, 2000); h = band(2000, 9000);
      let num = 0, den = 0;
      for (let i = 2; i < freq.length; i++) { num += i * freq[i]; den += freq[i]; }
      c = den ? num / den / freq.length : 0;
      if (mode === 'mic') { b *= 1.5; m *= 1.8; h *= 2.4; }
    } else {
      // gentle breathing when nothing is playing
      b = .28 + .12 * Math.sin(t * .5); m = .25 + .08 * Math.sin(t * .31 + 1); h = .15 + .06 * Math.sin(t * 1.1); c = .25;
    }
    lv.bass = lerp(lv.bass, clamp(b, 0, 1), .14);
    lv.mid = lerp(lv.mid, clamp(m, 0, 1), .1);
    lv.high = lerp(lv.high, clamp(h, 0, 1), .16);
    lv.level = lerp(lv.level, clamp((b + m + h) / 2, 0, 1), .06);
    lv.centroid = lerp(lv.centroid, c, .05);
    bassAvg = lerp(bassAvg, lv.bass, .015);
    lv.beat = lerp(lv.beat, clamp((lv.bass - bassAvg - .035) * 6, 0, 1), .35);
    mood.energy = lerp(mood.energy, lv.level, .004);
    mood.brightness = lerp(mood.brightness, clamp(lv.centroid * 4, 0, 1), .004);
    return live;
  }

  return { lv, mood, update, element, startMic, ensure, get mode() { return mode; }, get el() { return el; } };
}
