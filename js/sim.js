// A real wave-equation simulation on the GPU: a sheet of water (or air, or
// glass) that the music, your hands and your body push on. Waves travel,
// interfere, reflect off your silhouette, and slowly settle.
//
// State texture: R = height, G = velocity.

import { QUAD_VERT, program, drawQuad, target } from './gl.js';

const SIM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uState;
uniform sampler2D uMask;      // R = body now, G = body last frame (camera space, already mirrored)
uniform vec2 uTexel;
uniform float uAspect;
uniform vec4 uSrc[12];        // x, y, radius, amount
uniform int uNSrc;
uniform int uMaskOn;
uniform vec2 uCamMap;
uniform float uMaskPush;      // how hard moving bodies shove the water
uniform float uObstacle;      // 0..1: does the body block waves
uniform float uDamp;
void main(){
  vec4 s = texture(uState, vUv);
  float h = s.r, v = s.g;
  float l = texture(uState, vUv - vec2(uTexel.x, 0.)).r;
  float r = texture(uState, vUv + vec2(uTexel.x, 0.)).r;
  float d = texture(uState, vUv - vec2(0., uTexel.y)).r;
  float u = texture(uState, vUv + vec2(0., uTexel.y)).r;
  float lap = (l + r + u + d)*.25 - h;
  v += lap*1.25;
  v *= uDamp;
  h += v;
  h *= .9975;
  for(int i=0;i<12;i++){
    if(i>=uNSrc) break;
    vec4 S = uSrc[i];
    vec2 dd = (vUv - S.xy)*vec2(uAspect, 1.);
    h += S.w*exp(-dot(dd,dd)/(S.z*S.z));
  }
  if(uMaskOn==1){
    vec2 c = (vUv-.5)*uCamMap+.5;
    if(c.x>0. && c.x<1. && c.y>0. && c.y<1.){
      vec2 m = texture(uMask, c).rg;
      h += (m.r - m.g)*uMaskPush;
      float ob = smoothstep(.5, .9, m.r)*uObstacle;
      h = mix(h, 0., ob); v = mix(v, 0., ob);
    }
  }
  // soft edges so waves don't ring forever off the borders
  vec2 e = min(vUv, 1.-vUv);
  float edge = smoothstep(0., .03, min(e.x, e.y));
  h = h/(1. + abs(h)*.35);              // soft ceiling: loud music swells, never shatters
  o = vec4(clamp(h*edge, -2., 2.), clamp(v*edge, -1., 1.), 0., 1.);
}`;

export function createSim(gl, floatOK) {
  const W = 288, H = 176;
  if (!floatOK) return null;
  const A = target(gl, W, H), B = target(gl, W, H);
  if (!A.ok || !B.ok) return null;
  const { p, U } = program(gl, QUAD_VERT, SIM_FRAG);
  let read = A, write = B;
  const srcArr = new Float32Array(48);

  function step(sources, { maskTex, maskOn, camMap, maskPush, obstacle, damp, aspect }, iters = 2) {
    const n = Math.min(12, sources.length);
    srcArr.fill(0);
    sources.slice(0, n).forEach((s, i) => srcArr.set(s, i * 4));
    gl.useProgram(p);
    gl.viewport(0, 0, W, H);
    gl.uniform2f(U.uTexel, 1 / W, 1 / H);
    gl.uniform1f(U.uAspect, aspect);
    gl.uniform1i(U.uMaskOn, maskOn ? 1 : 0);
    gl.uniform2f(U.uCamMap, camMap[0], camMap[1]);
    gl.uniform1f(U.uMaskPush, maskPush);
    gl.uniform1f(U.uObstacle, obstacle);
    gl.uniform1f(U.uDamp, damp);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex); gl.uniform1i(U.uMask, 1);
    for (let k = 0; k < iters; k++) {
      // sources are injected once per frame, not per iteration
      gl.uniform1i(U.uNSrc, k === 0 ? n : 0);
      gl.uniform4fv(U.uSrc, srcArr);
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, read.tex); gl.uniform1i(U.uState, 0);
      drawQuad(gl);
      [read, write] = [write, read];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  return { step, get tex() { return read.tex; }, W, H };
}
