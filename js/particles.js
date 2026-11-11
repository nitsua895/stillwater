// Light that comes off your hands. Drawn on a 2D canvas over the shader with
// additive blending. Faster hands shed more light; each world moves it differently.

const rand = (a, b) => a + Math.random() * (b - a);
const PAL = [
  ['#fff1e0', '#ffd2b0', '#bfe3e6'],   // tide
  ['#ffe2a8', '#ffc078', '#b9cfff'],   // lightwell
  ['#bff7f2', '#7fd8dc', '#e6fffb'],   // undertow
  ['#ffd9a0', '#ff9fb8', '#9fe0ff', '#c7a8ff'], // prism
  ['#fff6d6', '#ffd27a', '#f2a796', '#c9f0c4'], // bloom
];
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const PALRGB = PAL.map(p => p.map(hex));

export function createParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const ps = [];
  let W = 0, H = 0;
  function resize(w, h, dpr) { W = w; H = h; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

  function emit(world, h, audio) {
    if (h.str < .05) return;
    const rate = h.speed * 18 + audio.beat * 3 * h.str;
    let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    n = Math.min(n, 8);
    const x = h.x * W, y = (1 - h.y) * H;
    for (let i = 0; i < n; i++) {
      const pal = PALRGB[world];
      ps.push({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: h.vx * W * rand(.2, .6) + rand(-.4, .4), vy: -h.vy * H * rand(.2, .6) + rand(-.4, .4),
        r: rand(1.2, 3.6), life: 1, decay: rand(.004, .012),
        c: pal[(Math.random() * pal.length) | 0], ph: rand(0, 6.28), spin: rand(-.05, .05), a: rand(0, 6.28),
      });
    }
  }

  function step(world, body, audio, t) {
    const S = body;
    emit(world, S.hands[0], audio); emit(world, S.hands[1], audio);
    if (ps.length > 900) ps.splice(0, ps.length - 900);
    const ox = (S.body.presence > .3 ? S.body.x : .5) * W, oy = H * .56;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      // each world has its own physics
      if (world === 0) { p.vy -= .006; p.vx += Math.sin(t * .8 + p.ph) * .01; }               // drift up like spray
      else if (world === 1) { p.vx += (ox - p.x) * .00012; p.vy += (oy - p.y) * .00012; }     // drawn to the orb
      else if (world === 2) { p.vy -= .012; p.vx += Math.sin(t * 2 + p.ph) * .03; }           // rising bubbles
      else if (world === 3) { p.a += p.spin; }                                                  // spinning shards
      else { p.vy += .004; p.vx += Math.sin(t + p.ph) * .015; }                                 // drifting seeds
      p.vx *= .975; p.vy *= .975; p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if (p.life <= 0 || p.y < -50 || p.y > H + 50) { ps.splice(i, 1); continue; }
      const tw = .65 + .35 * Math.sin(t * 4 + p.ph) * (.4 + audio.high * 2);
      const a = p.life * tw, R = p.r * (1.6 + audio.bass * 2.2);
      const [r, g, b] = p.c;
      if (world === 3) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = `rgba(${r},${g},${b},${a * .55})`;
        ctx.beginPath(); ctx.moveTo(0, -R * 2.2); ctx.lineTo(R * 1.3, R); ctx.lineTo(-R * 1.1, R * .8); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 3);
        gr.addColorStop(0, `rgba(${r},${g},${b},${a * .9})`);
        gr.addColorStop(.3, `rgba(${r},${g},${b},${a * .3})`);
        gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gr; ctx.fillRect(p.x - R * 3, p.y - R * 3, R * 6, R * 6);
      }
    }
    // a soft halo on each live hand, so you can find yourself on the wall
    for (const h of S.hands) {
      if (h.str < .08) continue;
      const x = h.x * W, y = (1 - h.y) * H, R = 26 + h.str * 30 + audio.bass * 18;
      const [r, g, b] = PALRGB[world][0];
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(${r},${g},${b},${.35 * h.str})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return { resize, step };
}

// average colour of each world, for driving room lights later
export const WORLD_TINT = PALRGB.map(p => p[1]);
