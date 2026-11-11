// The five worlds. One fragment shader, crossfading between two worlds.
//
// Inputs every world shares:
//   uSim   - the physics sheet (R = height). Music, hands and your body make waves in it;
//            worlds read its height + slope to light it in 3D.
//   uSpec  - 64-band spectrum, low -> high (log spaced), so frequencies map to places.
//   uMask  - your body silhouette from the camera (R = now, B = soft/blurred).
//   hands, body centre, motion / stillness / rise / openness, reward pulse.

export const WORLD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uAudio;   // bass, mid, high, level
uniform float uBeat;
uniform vec3 uH0;
uniform vec3 uH1;
uniform vec3 uBody;    // x, y, presence
uniform vec4 uMove;    // motion, stillness, rise, openness
uniform float uPulse;
uniform int uA;
uniform int uB;
uniform float uFade;
uniform sampler2D uSim;
uniform sampler2D uSpec;
uniform sampler2D uMask;
uniform int uSimOn;
uniform int uMaskOn;
uniform vec2 uCamMap;
uniform vec2 uSimTexel;

float ASP;
const float PI = 3.14159265;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; }
  return v;
}
vec2 toP(vec2 uv){ return vec2((uv.x-.5)*ASP, uv.y-.5); }
float glow(vec2 p, vec3 h, float r){ if(h.z<=0.) return 0.; float d = length(p-toP(h.xy)); return h.z*exp(-d*d/(r*r)); }

// ---- physics sheet ----
float simH(vec2 uv){ return uSimOn==1 ? texture(uSim, uv).r : 0.; }
vec2 simGrad(vec2 uv){
  if(uSimOn==0) return vec2(0.);
  vec2 e = uSimTexel*1.5;
  return vec2(texture(uSim, uv+vec2(e.x,0.)).r - texture(uSim, uv-vec2(e.x,0.)).r,
              texture(uSim, uv+vec2(0.,e.y)).r - texture(uSim, uv-vec2(0.,e.y)).r);
}
vec2 softG(vec2 g, float k){ return g/(1. + length(g)*k); }
float simLap(vec2 uv){
  if(uSimOn==0) return 0.;
  vec2 e = uSimTexel*2.;
  return texture(uSim, uv+vec2(e.x,0.)).r + texture(uSim, uv-vec2(e.x,0.)).r
       + texture(uSim, uv+vec2(0.,e.y)).r + texture(uSim, uv-vec2(0.,e.y)).r - 4.*texture(uSim, uv).r;
}
// ---- spectrum: x = 0 (lows) .. 1 (highs) ----
float spec(float x){ return texture(uSpec, vec2(clamp(x,0.,1.), .5)).r; }
// ---- body silhouette ----
vec2 camUV(vec2 uv){ return (uv-.5)*uCamMap+.5; }
vec3 maskAt(vec2 uv){
  if(uMaskOn==0) return vec3(0.);
  vec2 c = camUV(uv);
  if(c.x<0. || c.x>1. || c.y<0. || c.y>1.) return vec3(0.);
  return texture(uMask, c).rgb;
}
float body(vec2 uv){ return smoothstep(.35, .75, maskAt(uv).r); }
vec2 bodyGrad(vec2 uv){
  float e = .006;
  return vec2(maskAt(uv+vec2(e,0.)).b - maskAt(uv-vec2(e,0.)).b, maskAt(uv+vec2(0.,e)).b - maskAt(uv-vec2(0.,e)).b);
}

// ============ 0 · TIDE : a real sea you look out across ============
vec3 skyCol(vec3 d, vec3 sun){
  float t = clamp(d.y*2.2, 0., 1.);
  vec3 c = mix(vec3(1.,.80,.66), vec3(.40,.58,.72), pow(t,.55));
  float s = max(dot(d, sun), 0.);
  c += vec3(1.,.86,.68)*(pow(s, 8.)*.45 + pow(s, 600.)*3.);
  return c;
}
vec3 tide(vec2 uv, vec2 p){
  float hz = .45;
  vec3 sun = normalize(vec3(((uBody.x-.5)*ASP)*.25*uBody.z, .025 + uMove.y*.16 + uMove.z*.08, 1.));
  vec3 rd = normalize(vec3(p.x, uv.y-hz, 1.));
  vec3 col;
  if(rd.y > 0.){
    col = skyCol(rd, sun);
    float c = fbm(vec2(rd.x/(rd.y+.15)*1.2 + uTime*.01, 1./(rd.y+.15)*.9));
    col = mix(col, vec3(1.,.93,.88), smoothstep(.5,.85,c)*.35*smoothstep(0.,.25,rd.y));
  } else {
    // camera 1 unit above the water: intersect the ray with the sea
    float t = -1./rd.y;
    vec3 hit = rd*t;
    vec2 suv = vec2(hit.x/9. + .5, (hit.z-.8)/12.);
    float inSim = smoothstep(1., .85, suv.y)*step(0., suv.y)*smoothstep(0.,.05,suv.x)*smoothstep(1.,.95,suv.x);
    vec2 g = softG(simGrad(clamp(suv,0.,1.)), 3.)*inSim;
    float h = simH(clamp(suv,0.,1.))*inSim;
    // small procedural chop, louder with highs
    vec2 q = hit.xz*vec2(.9,.6);
    float ch = .5 + .5*uAudio.z;
    vec2 pg = vec2(noise(q*3.+uTime*.6)-noise(q*3.+vec2(.1,0.)+uTime*.6), noise(q*2.7-uTime*.5)-noise(q*2.7+vec2(0.,.1)-uTime*.5))*ch;
    vec3 n = normalize(vec3(-(g.x*5.+pg.x*1.2), 1., -(g.y*5.+pg.y*1.2)));
    vec3 r = reflect(rd, n);
    r.y = abs(r.y);
    float fres = .03 + .97*pow(1. - max(dot(-rd, n), 0.), 5.);
    vec3 deep = mix(vec3(.10,.28,.36), vec3(.18,.42,.48), clamp(h*2.+.5, 0., 1.));
    col = mix(deep, skyCol(r, sun), fres);
    col += vec3(1.,.9,.75)*clamp(h, 0., 1.)*.25;                 // light through the crests
    // your reflection in the water, broken up by the waves
    vec2 ruv = vec2(uv.x + n.x*.06, 2.*hz - uv.y + n.z*.06);
    float rb = body(ruv);
    col = mix(col, col*.6 + vec3(1.,.85,.7)*.35, rb*.6*smoothstep(.0,.25,hz-uv.y+.05));
    // fade to haze at the horizon
    col = mix(col, skyCol(normalize(vec3(rd.x,.0,1.)), sun), smoothstep(25.,90.,t)*.8);
  }
  // you, standing in the dawn: a dusk-blue figure with a warm sunlit rim
  float b = body(uv);
  if(b>0.){
    vec2 bg = bodyGrad(uv);
    float rim = clamp(dot(normalize(bg+1e-5), -normalize(vec2(sun.x, sun.y+.2)))*length(bg)*6., 0., 1.);
    vec3 fig = mix(vec3(.16,.22,.32), vec3(.98,.80,.62), .15 + uMove.y*.35);
    fig += vec3(1.,.82,.6)*(spec(.15)*.25 + uAudio.x*.15);
    col = mix(col, fig, b*.82);
    col += vec3(1.,.85,.65)*rim*1.2;
  }
  return col;
}

// ============ 1 · LIGHTWELL : a beam, dust in the air, a gathering orb ============
vec3 lightwell(vec2 uv, vec2 p){
  vec3 col = mix(vec3(.03,.04,.11), vec3(.11,.07,.20), uv.y);
  float star = step(.996, hash(floor(uv*vec2(ASP,1.)*180.)));
  col += star*(.3+.7*noise(uv*40.+uTime))*.35;
  float air = simH(uv);
  vec2 ag = simGrad(uv);
  float bx = sin(uTime*.06)*.12 + (uBody.x-.5)*ASP*.35*uBody.z;
  float bw = .07 + uAudio.x*.05 + uMove.z*.12;
  float bc = bx + (uv.y-1.)*.08 + ag.x*.4;
  float beam = exp(-pow((p.x-bc)/bw, 2.))*smoothstep(-.55,.45,p.y);
  // dust density: sound pressure waves make it thicken and thin as they pass
  float dust = fbm(p*vec2(4.,1.6) + vec2(0., -uTime*.06) + ag*3.);
  dust *= .7 + air*1.6;
  col += vec3(1.,.84,.58)*beam*(.15+.6*max(dust,0.))*(.55+uAudio.w*.8);
  // motes: each column of dust answers a different frequency
  vec2 mc = p*60. + vec2(0., uTime*1.5);
  float mh = hash(floor(mc));
  float band = spec(fract(mh*7.31));
  float mote = step(.985 - band*.05, mh)*smoothstep(.35, 0., length(fract(mc)-.5));
  col += vec3(1.,.95,.8)*mote*(beam*1.4+.1)*(.5 + band);
  // orb
  vec2 oc = vec2(bx, -.06 + uMove.z*.08);
  float r = .035 + uMove.y*.15 + uAudio.x*.025 + uBeat*.01;
  float od = length(p-oc);
  col += vec3(1.,.9,.7)*(smoothstep(r, r*.55, od)*.85 + exp(-od/(r+.02)*1.3)*.45);
  // pressure rings leaving the orb
  col += vec3(1.,.85,.6)*max(air,0.)*.25*exp(-od*2.);
  // you, standing in the beam: dark shape, rim lit from the light, filling with light as you still
  float b = body(uv);
  if(b>0.){
    vec2 bg = bodyGrad(uv);
    vec2 toBeam = normalize(vec2(bc - p.x, .6));
    float rim = clamp(dot(normalize(bg+1e-5), -toBeam), 0., 1.)*clamp(length(bg)*7., 0., 1.);
    float inner = fbm(p*6. + vec2(0., -uTime*.3))*uMove.y;
    vec3 fig = vec3(.02,.02,.05) + vec3(1.,.82,.55)*inner*.9 + vec3(1.,.9,.7)*uMove.y*.15;
    col = mix(col, fig, b*.9);
    col += vec3(1.,.88,.62)*rim*(1.2 + beam);
  }
  col += vec3(1.,.75,.45)*glow(p,uH0,.07)*.6 + vec3(.6,.75,1.)*glow(p,uH1,.07)*.6;
  return col;
}

// ============ 2 · UNDERTOW : beneath the surface, light folded by real waves ============
vec3 undertow(vec2 uv, vec2 p){
  vec2 g = softG(simGrad(uv), 4.);
  float lap = clamp(simLap(uv), -.08, .08);
  vec2 q = p*2.6 + g*4.;               // the moving surface refracts everything below
  float t = uTime*.12;
  vec2 w = q + vec2(fbm(q+t), fbm(q-t+3.1))*.8;
  float l1 = 1. - abs(noise(w*2.2 + vec2(t*1.3, -t)) - .5)*2.;
  float l2 = 1. - abs(noise(w*2.9 - vec2(t, t*1.1) + 5.) - .5)*2.;
  float caus = pow(l1, 6.)*pow(l2, 6.)*2.5 + pow(l1, 18.)*.6;
  // focusing: where the surface curves inward, light concentrates (physical caustics)
  caus += max(-lap, 0.)*10.;
  vec3 col = mix(vec3(.01,.035,.07), vec3(.04,.22,.30), pow(uv.y,1.3));
  col += vec3(.45,.85,.88)*caus*(.16+uAudio.x*.45+uMove.y*.25)*(.25+uv.y);
  float rays = fbm(vec2(p.x*3.5 + p.y*1.2 + g.x*2., uTime*.04));
  col += vec3(.25,.55,.6)*pow(rays,3.)*smoothstep(-.4,.6,p.y)*(.6+uMove.y*.8);
  // deep thrum: low frequencies glow up from below
  col += vec3(.05,.2,.25)*spec(.05)*smoothstep(.3,-.5,p.y)*.8;
  col *= .85 + .3*uAudio.w;
  // you, suspended: a dark diver shape, caustics playing across you, a cyan edge
  float b = body(uv);
  if(b>0.){
    vec2 bg = bodyGrad(uv);
    float edge = clamp(length(bg)*6., 0., 1.);
    vec3 fig = vec3(.01,.05,.08) + vec3(.4,.8,.85)*caus*.25 + vec3(.1,.35,.4)*uMove.y*.4;
    col = mix(col, fig, b*.85);
    col += vec3(.5,.95,1.)*edge*.7*(.6 + uAudio.z);
  }
  col += vec3(.5,.9,.9)*(glow(p,uH0,.06)+glow(p,uH1,.06))*.2;
  return col;
}

// ============ 3 · PRISM : stained glass that rings with the music ============
vec3 glass(vec2 p, float scale, float warm, out float edgeOut){
  vec2 gq = p*scale;
  vec2 ip = floor(gq), fp = fract(gq);
  float f1 = 9., f2 = 9.; vec2 id = vec2(0.);
  float shake = .15 + uMove.x*.9;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 o = vec2(float(x), float(y));
    vec2 cid = ip+o;
    vec2 pt = vec2(hash(cid), hash(cid+7.1));
    pt = .5 + .4*sin(uTime*.25*shake + 6.28*pt);
    float d = length(o+pt-fp);
    if(d<f1){ f2=f1; f1=d; id=cid; } else if(d<f2){ f2=d; }
  }
  float hsh = hash(id);
  // each pane is tuned to its own frequency band
  float lvl = spec(hsh);
  vec3 jewel = .5 + .5*cos(6.28*(hsh*.6 + uTime*.015 + vec3(0.,.33,.67)));
  jewel = mix(jewel, vec3(.95,.72,.42), .25 + warm*.45);
  jewel *= .35 + lvl*1.3;
  edgeOut = f2-f1;
  return jewel;
}
vec3 prism(vec2 uv, vec2 p){
  vec2 g = softG(simGrad(uv), 6.);
  vec2 rp = p + g*.45;                // waves bend the light passing through the glass
  float e;
  vec3 jewel = glass(rp, 5., 0., e);
  float back = .5 + .6*exp(-length(rp-vec2(0.,.45))*1.4);
  jewel *= back*(.7 + .3*uAudio.w + .35*uBeat);
  float lead = smoothstep(.02, .09 - uMove.y*.05, e);
  vec3 leadCol = mix(vec3(.03,.02,.05), vec3(1.,.8,.5), uMove.y*.9);
  vec3 col = mix(leadCol, jewel, lead);
  // glints where the glass is flexing
  col += vec3(1.,.95,.85)*pow(clamp(length(g)*4., 0., 1.), 2.)*.35;
  // you become a window: finer, warmer panes, outlined in gold
  float b = body(uv);
  if(b>0.){
    float e2;
    vec3 fj = glass(rp + vec2(3.7,1.3), 13., 1., e2)*(.9 + uMove.y*.6);
    float l2 = smoothstep(.02, .08, e2);
    vec3 fig = mix(vec3(.5,.35,.15)*uMove.y + vec3(.04,.03,.02), fj, l2);
    col = mix(col, fig, b);
    col += vec3(1.,.8,.45)*clamp(length(bodyGrad(uv))*6., 0., 1.)*.9;
  }
  col += vec3(1.,.9,.8)*(glow(p,uH0,.08)+glow(p,uH1,.08))*.2;
  return col;
}

// ============ 4 · BLOOM : a flower membrane that the sound moves ============
vec3 bloom(vec2 uv, vec2 p){
  vec2 c = mix(vec2(0.,-.02), toP(uBody.xy)*vec2(1.,.5), uBody.z*.4);
  float h = simH(uv);
  vec2 g = softG(simGrad(uv), 5.);
  vec3 n = normalize(vec3(-g*2.5, 1.));
  vec3 L = normalize(vec3(-.4,.6,.7));
  float shade = .75 + .45*dot(n, L);
  vec2 d = p-c;
  float r = length(d), a = atan(d.y, d.x);
  vec3 col = mix(vec3(.30,.46,.36), vec3(.88,.90,.74), uv.y);
  col = mix(col, vec3(.96,.95,.84), fbm(p*2. + uTime*.01)*.35);
  float open = .16 + uMove.y*.22 + uMove.w*.12 + uAudio.x*.05;
  for(int k=0;k<4;k++){
    float fk = float(k);
    float band = spec(.08 + fk*.22);              // inner petals answer the highs, outer the lows
    float rk = open*(1.25 - fk*.25)*(1. + band*.12);
    float nn = 5. + fk*2.;
    float dir = mod(fk,2.)<.5 ? 1. : -1.;
    float edge = r - rk*(.75 + .25*cos(a*nn + uTime*.05*dir + fk)) - h*.04;
    vec3 pc = k==0 ? vec3(.36,.62,.48) : k==1 ? vec3(.91,.62,.56) : k==2 ? vec3(.97,.82,.48) : vec3(1.,.97,.88);
    float m = smoothstep(.012, -.012, edge);
    float vein = .9 + .1*sin(a*nn*4. + r*40.);
    col = mix(col, pc*vein*shade, m*.75);
  }
  col *= mix(1., shade, .5);
  col += vec3(1.,.97,.85)*exp(-r*18./(1.+uMove.y))*.6;
  // you, overgrown: leaves fill your shape, blossoms open as you hold still
  float b = body(uv);
  if(b>0.){
    vec2 lp = p*14.;
    float leaf = fbm(lp + vec2(0., uTime*.05));
    vec3 fig = mix(vec3(.12,.30,.18), vec3(.40,.64,.36), leaf)*shade;
    vec2 cell = floor(lp*.6); vec2 fc = fract(lp*.6)-.5;
    float bl = step(1. - uMove.y*.55 - spec(hash(cell))*.25, hash(cell+3.));
    float petal = smoothstep(.28, .1, length(fc))*(.7+.3*cos(atan(fc.y,fc.x)*5.));
    fig = mix(fig, mix(vec3(1.,.78,.72), vec3(1.,.92,.6), hash(cell+9.)), bl*petal);
    col = mix(col, fig, b*.92);
    col += vec3(1.,.95,.7)*clamp(length(bodyGrad(uv))*6., 0., 1.)*.45;
  }
  col += vec3(1.,.95,.75)*(glow(p,uH0,.07)+glow(p,uH1,.07))*.25;
  return col;
}

vec3 world(int s, vec2 uv, vec2 p){
  if(s==0) return tide(uv,p);
  if(s==1) return lightwell(uv,p);
  if(s==2) return undertow(uv,p);
  if(s==3) return prism(uv,p);
  return bloom(uv,p);
}

void main(){
  ASP = uRes.x/uRes.y;
  vec2 uv = vUv, p = toP(uv);
  vec3 col = world(uA, uv, p);
  if(uFade < 1.) col = mix(world(uB, uv, p), col, smoothstep(0.,1.,uFade));
  if(uPulse > 0.){
    vec2 bc = uBody.z>0. ? toP(uBody.xy) : vec2(0.);
    float rr = (1.-uPulse)*1.4;
    float ring = exp(-pow((length(p-bc)-rr)*14., 2.));
    col += vec3(1.,.95,.85)*ring*uPulse*.5;
  }
  col *= 1. - .35*smoothstep(.45, 1.1, length(p*vec2(.8,1.)));
  col += (hash(uv*uRes + fract(uTime)*100.)-.5)*.025;
  outColor = vec4(clamp(col,0.,1.), 1.);
}
`;
