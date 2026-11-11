// A real-time fluid (stable-fluids method) that your body stirs.
//
//  - Moving limbs push the fluid in the direction they move and leave colour behind.
//  - The moving edge of your silhouette pushes and paints too, so your whole body
//    counts, not just your hands.
//  - Holding still makes your outline glow, and that light slowly spreads.
//  - The music: soft "breaths" push outward from your centre on the low end,
//    and the highs add fine swirls (vorticity).
//
// Velocity is stored in grid cells per second; the dye is RGB light (or ink).

import { QUAD_VERT, program, drawQuad, target } from './gl.js';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uTexel;
`;

const ADVECT = HEAD + `
uniform sampler2D uVel;
uniform sampler2D uSrc;
uniform vec2 uVelTexel;
uniform float uDt;
uniform float uKeep;     // fraction kept per step
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 from = vUv - uDt*v*uVelTexel;
  o = texture(uSrc, from)*uKeep;
}`;

const CURL = HEAD + `
uniform sampler2D uVel;
void main(){
  float l = texture(uVel, vUv - vec2(uTexel.x,0.)).y, r = texture(uVel, vUv + vec2(uTexel.x,0.)).y;
  float b = texture(uVel, vUv - vec2(0.,uTexel.y)).x, t = texture(uVel, vUv + vec2(0.,uTexel.y)).x;
  o = vec4(.5*((r - l) - (t - b)), 0., 0., 1.);
}`;

const VORTICITY = HEAD + `
uniform sampler2D uVel;
uniform sampler2D uCurl;
uniform float uStrength;
uniform float uDt;
void main(){
  float l = abs(texture(uCurl, vUv - vec2(uTexel.x,0.)).x), r = abs(texture(uCurl, vUv + vec2(uTexel.x,0.)).x);
  float b = abs(texture(uCurl, vUv - vec2(0.,uTexel.y)).x), t = abs(texture(uCurl, vUv + vec2(0.,uTexel.y)).x);
  float c = texture(uCurl, vUv).x;
  vec2 n = vec2(t - b, r - l);
  n /= length(n) + 1e-4;
  vec2 v = texture(uVel, vUv).xy + n*vec2(1.,-1.)*c*uStrength*uDt;
  o = vec4(clamp(v, -1500., 1500.), 0., 1.);
}`;

const DIVERGENCE = HEAD + `
uniform sampler2D uVel;
void main(){
  float l = texture(uVel, vUv - vec2(uTexel.x,0.)).x, r = texture(uVel, vUv + vec2(uTexel.x,0.)).x;
  float b = texture(uVel, vUv - vec2(0.,uTexel.y)).y, t = texture(uVel, vUv + vec2(0.,uTexel.y)).y;
  o = vec4(.5*((r - l) + (t - b)), 0., 0., 1.);
}`;

const PRESSURE = HEAD + `
uniform sampler2D uP;
uniform sampler2D uDiv;
void main(){
  float l = texture(uP, vUv - vec2(uTexel.x,0.)).x, r = texture(uP, vUv + vec2(uTexel.x,0.)).x;
  float b = texture(uP, vUv - vec2(0.,uTexel.y)).x, t = texture(uP, vUv + vec2(0.,uTexel.y)).x;
  o = vec4((l + r + b + t - texture(uDiv, vUv).x)*.25, 0., 0., 1.);
}`;

const GRADIENT = HEAD + `
uniform sampler2D uP;
uniform sampler2D uVel;
void main(){
  float l = texture(uP, vUv - vec2(uTexel.x,0.)).x, r = texture(uP, vUv + vec2(uTexel.x,0.)).x;
  float b = texture(uP, vUv - vec2(0.,uTexel.y)).x, t = texture(uP, vUv + vec2(0.,uTexel.y)).x;
  o = vec4(texture(uVel, vUv).xy - .5*vec2(r - l, t - b), 0., 1.);
}`;

const SCALE = HEAD + `
uniform sampler2D uSrc;
uniform float uK;
void main(){ o = texture(uSrc, vUv)*uK; }`;

// splats from body parts + forces/paint from the silhouette + music breath
const INJECT = HEAD + `
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform vec4 uP[12];       // x, y (uv), radius, 0
uniform vec4 uV[12];       // value (vel: xy cells/s; dye: rgb)
uniform int uN;
uniform float uAspect;
uniform int uMode;         // 0 velocity, 1 dye
uniform int uMaskOn;
uniform vec2 uCamMap;
uniform float uEdge;       // moving outline: push (vel) or paint (dye)
uniform float uStill;      // still outline glow (dye)
uniform vec3 uCol;         // body colour (dye)
uniform vec2 uCenter;
uniform float uBreath;     // outward push from your centre (vel)
uniform float uDt;
vec3 mask(vec2 uv){
  vec2 c = (uv-.5)*uCamMap+.5;
  if(c.x<0. || c.x>1. || c.y<0. || c.y>1.) return vec3(0.);
  return texture(uMask, c).rgb;
}
void main(){
  vec4 c = texture(uSrc, vUv);
  for(int i=0;i<12;i++){
    if(i>=uN) break;
    vec2 d = (vUv - uP[i].xy)*vec2(uAspect, 1.);
    float w = exp(-dot(d,d)/(uP[i].z*uP[i].z));
    c.rgb += uV[i].rgb*w;
  }
  vec2 fromC = (vUv - uCenter)*vec2(uAspect,1.);
  float rc = length(fromC);
  if(uMode==0) c.xy += fromC/(rc+1e-3)*uBreath*exp(-rc*3.)*smoothstep(0.,.05,rc);
  if(uMaskOn==1){
    vec3 m = mask(vUv);
    float e = .006;
    vec2 g = vec2(mask(vUv+vec2(e,0.)).b - mask(vUv-vec2(e,0.)).b, mask(vUv+vec2(0.,e)).b - mask(vUv-vec2(0.,e)).b);
    float gl = length(g);
    float arrive = m.r - m.g;                       // + where your body just moved in
    if(uMode==0){
      if(gl > .02) c.xy += -g/gl*arrive*uEdge;      // the edge pushes the way it moves
    } else {
      c.rgb += uCol*max(arrive, 0.)*uEdge;
      float outline = smoothstep(.15, .45, m.b)*(1. - smoothstep(.55, .9, m.b));
      c.rgb += uCol*outline*uStill*uDt;
    }
  }
  o = c;
}`;

export function createFluid(gl, floatOK) {
  if (!floatOK) return null;
  const P = {
    advect: program(gl, QUAD_VERT, ADVECT), curl: program(gl, QUAD_VERT, CURL), vort: program(gl, QUAD_VERT, VORTICITY),
    div: program(gl, QUAD_VERT, DIVERGENCE), press: program(gl, QUAD_VERT, PRESSURE), grad: program(gl, QUAD_VERT, GRADIENT),
    scale: program(gl, QUAD_VERT, SCALE), inject: program(gl, QUAD_VERT, INJECT),
  };
  let SW = 0, SH = 0, DW = 0, DH = 0, vel, dye, pres, divT, curlT;
  const pair = (w, h) => { const a = target(gl, w, h), b = target(gl, w, h); return { r: a, w: b, swap() { [this.r, this.w] = [this.w, this.r]; } }; };
  function resize(aspect) {
    const sw = 192, sh = Math.max(64, Math.round(192 / aspect)), dw = 512, dh = Math.max(160, Math.round(512 / aspect));
    if (sw === SW && sh === SH) return;
    SW = sw; SH = sh; DW = dw; DH = dh;
    vel = pair(SW, SH); pres = pair(SW, SH); dye = pair(DW, DH);
    divT = target(gl, SW, SH); curlT = target(gl, SW, SH);
  }
  function pass(prog, dest, w, h, setup) {
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(prog.U.uTexel, 1 / w, 1 / h);
    let unit = 0;
    const tex = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.U[name], unit); unit++; };
    setup(prog.U, tex);
    drawQuad(gl);
  }
  const pArr = new Float32Array(48), vArr = new Float32Array(48), dArr = new Float32Array(48);

  // opts: { dt, aspect, splats:[{x,y,r,vx,vy,col:[r,g,b]}], maskTex, maskOn, camMap, edgePush, edgePaint, stillGlow, bodyCol, center, breath, swirl, keepDye, keepVel }
  function step(o) {
    resize(o.aspect);
    const dt = Math.min(o.dt, 1 / 30);
    const n = Math.min(12, o.splats.length);
    pArr.fill(0); vArr.fill(0); dArr.fill(0);
    for (let i = 0; i < n; i++) {
      const s = o.splats[i];
      pArr.set([s.x, s.y, s.r, 0], i * 4);
      vArr.set([s.vx * SW, s.vy * SH, 0, 0], i * 4);         // uv/s -> cells/s
      dArr.set([...s.col, 0], i * 4);
    }
    const inject = (dst, src, w, h, mode) => pass(P.inject, dst, w, h, (U, tex) => {
      tex('uSrc', src); tex('uMask', o.maskTex);
      gl.uniform4fv(U.uP, pArr); gl.uniform4fv(U.uV, mode ? dArr : vArr); gl.uniform1i(U.uN, n);
      gl.uniform1f(U.uAspect, o.aspect); gl.uniform1i(U.uMode, mode); gl.uniform1i(U.uMaskOn, o.maskOn ? 1 : 0);
      gl.uniform2f(U.uCamMap, o.camMap[0], o.camMap[1]);
      gl.uniform1f(U.uEdge, mode ? o.edgePaint : o.edgePush); gl.uniform1f(U.uStill, o.stillGlow);
      gl.uniform3f(U.uCol, ...o.bodyCol); gl.uniform2f(U.uCenter, o.center[0], o.center[1]);
      gl.uniform1f(U.uBreath, o.breath); gl.uniform1f(U.uDt, dt);
    });
    // forces
    inject(vel.w, vel.r.tex, SW, SH, 0); vel.swap();
    pass(P.curl, curlT, SW, SH, (U, tex) => tex('uVel', vel.r.tex));
    pass(P.vort, vel.w, SW, SH, (U, tex) => { tex('uVel', vel.r.tex); tex('uCurl', curlT.tex); gl.uniform1f(U.uStrength, o.swirl); gl.uniform1f(U.uDt, dt); }); vel.swap();
    // make it incompressible
    pass(P.div, divT, SW, SH, (U, tex) => tex('uVel', vel.r.tex));
    pass(P.scale, pres.w, SW, SH, (U, tex) => { tex('uSrc', pres.r.tex); gl.uniform1f(U.uK, .8); }); pres.swap();
    for (let i = 0; i < 18; i++) { pass(P.press, pres.w, SW, SH, (U, tex) => { tex('uP', pres.r.tex); tex('uDiv', divT.tex); }); pres.swap(); }
    pass(P.grad, vel.w, SW, SH, (U, tex) => { tex('uP', pres.r.tex); tex('uVel', vel.r.tex); }); vel.swap();
    // move things along
    pass(P.advect, vel.w, SW, SH, (U, tex) => { tex('uVel', vel.r.tex); tex('uSrc', vel.r.tex); gl.uniform2f(U.uVelTexel, 1 / SW, 1 / SH); gl.uniform1f(U.uDt, dt); gl.uniform1f(U.uKeep, Math.pow(o.keepVel, dt)); }); vel.swap();
    inject(dye.w, dye.r.tex, DW, DH, 1); dye.swap();
    pass(P.advect, dye.w, DW, DH, (U, tex) => { tex('uVel', vel.r.tex); tex('uSrc', dye.r.tex); gl.uniform2f(U.uVelTexel, 1 / SW, 1 / SH); gl.uniform1f(U.uDt, dt); gl.uniform1f(U.uKeep, Math.pow(o.keepDye, dt)); }); dye.swap();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function clear() {
    for (const t of [vel.r, vel.w, dye.r, dye.w, pres.r, pres.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  return { step, clear, resize, get dye() { return dye.r.tex; }, get vel() { return vel.r.tex; }, get dyeTexel() { return [1 / DW, 1 / DH]; } };
}
