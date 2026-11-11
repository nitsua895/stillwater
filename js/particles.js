// Small moving things, only in the two silhouette worlds:
//   Lightwell  dust motes drift in the beam and gather toward your hands
//   Undertow   bubbles rise from moving hands, and from the deep on high notes
// Everything is slow and soft. Drawn additively over the shader.

const rand = (a, b) => a + Math.random() * (b - a);
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const MOTE = ['#ffe6b0', '#ffd08a', '#fff4dc'].map(hex);
const PETAL = ['#ffc8bd', '#ffe0a6', '#fff2e0', '#f6b3a8'].map(hex);

export function createParticles(canvas) {
  const ctx = canvas.getContext('2d');
  let ps = [], W = 0, H = 0, lastWorld = -1;
  function resize(w, h, dpr) { W = w; H = h; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  const live = h => h.str > .08;
  const hx = h => h.x * W, hy = h => (1 - h.y) * H;

  function spawn(world, S, audio, t) {
    const A = audio.soft;
    if (world === 1) {
      const ASP = W / H;
      const bx = (Math.sin(t * .04) * .12 + (S.body.x - .5) * ASP * .35 * S.body.presence) / ASP + .5;
      if (ps.length < 220 && Math.random() < .5 + A.high) {
        ps.push({ x: (bx + rand(-.08, .08)) * W, y: rand(0, H), vx: 0, vy: rand(-.15, -.05), r: rand(.8, 2), life: 1, decay: rand(.0015, .004), c: MOTE[(Math.random() * 3) | 0], ph: rand(0, 6.28) });
      }
    } else if (world === 2) {
      if (ps.length < 160 && Math.random() < A.high * .6) ps.push(bubble(rand(0, W), H + 10, rand(1.5, 3.5)));
      for (const h of S.hands) if (live(h) && Math.random() < Math.min(h.speed, 1.5) * .5) ps.push(bubble(hx(h) + rand(-10, 10), hy(h), rand(1.5, 4)));
    } else if (false) {
      for (const h of S.hands) if (live(h) && ps.length < 140 && Math.random() < Math.min(h.speed, 1.5) * .35) {
        ps.push({ x: hx(h), y: hy(h), vx: rand(-.3, .3), vy: rand(-.2, .1), r: rand(3, 6), life: 1, decay: rand(.002, .004), c: PETAL[(Math.random() * 4) | 0], ph: rand(0, 6.28), rot: rand(0, 6.28), spin: rand(-.01, .01) });
      }
    }
  }
  const bubble = (x, y, r) => ({ x, y, vx: 0, vy: rand(-.7, -.35), r, life: 1, decay: rand(.002, .004), ph: rand(0, 6.28) });

  function step(world, S, audio, t) {
    if (world !== lastWorld) { ps = ps.filter(() => Math.random() < .3); lastWorld = world; }
    spawn(world, S, audio, t);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const hands = S.hands.filter(live);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (world === 1) {
        // motes are drawn to your hands and circle there
        for (const h of hands) {
          const dx = hx(h) - p.x, dy = hy(h) - p.y, d = Math.hypot(dx, dy) + 20;
          if (d < 420) { p.vx += dx / d * .03 + -dy / d * .015; p.vy += dy / d * .03 + dx / d * .015; }
        }
        p.vx *= .96; p.vy *= .96;
      } else if (world === 2) {
        p.vx = Math.sin(t * 1.2 + p.ph) * .25; p.vy *= .995;
      } else if (world === 4) {
        p.vy += .004; p.vx += Math.sin(t * .6 + p.ph) * .008; p.vx *= .99; p.vy = Math.min(p.vy, .5); p.rot += p.spin;
      } else { p.life -= .03; }
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      if (p.life <= 0 || p.y < -30 || p.y > H + 30) { ps.splice(i, 1); continue; }
      const fadeIn = Math.min(1, (1 - p.life) * 8);
      const a = p.life * fadeIn;
      if (world === 2) {
        ctx.strokeStyle = `rgba(190,245,245,${a * .35})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke();
      } else if (world === 4) {
        const [r, g, b] = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(${r},${g},${b},${a * .45})`;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); ctx.fill(); ctx.restore();
      } else {
        const [r, g, b] = p.c || MOTE[0];
        const tw = .6 + .4 * Math.sin(t * 1.5 + p.ph) * (.5 + audio.soft.high * 1.5);
        const R = p.r * 3;
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        gr.addColorStop(0, `rgba(${r},${g},${b},${a * tw * .8})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = gr; ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return { resize, step };
}

// a colour per world, for driving room lights later
export const WORLD_TINT = [[255, 200, 160], [255, 208, 138], [127, 216, 220], [235, 225, 255], [255, 210, 122]];
