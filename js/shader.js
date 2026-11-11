// Fullscreen fragment shader. Five original "worlds", crossfaded.
// Every world reads the same inputs: audio bands, the body, two hands,
// motion / stillness / rise / openness, and a reward pulse.

export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos,0.,1.); }
`;

export const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uAudio;   // bass, mid, high, level
uniform float uBeat;
uniform vec3 uH0;      // hand 0: x, y (uv, y up), strength
uniform vec3 uH1;      // hand 1
uniform vec3 uBody;    // x, y, presence
uniform vec4 uMove;    // motion, stillness, rise, openness
uniform float uPulse;  // 1 -> 0 after a stillness reward
uniform int uA;
uniform int uB;
uniform float uFade;

float ASP;

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

// ---------- 0 · TIDE : dawn sea, horizon, breath ----------
vec3 tide(vec2 uv, vec2 p){
  float hz = .42 + .015*sin(uTime*.07);
  float sunY = hz + .03 + uMove.y*.16 + uMove.z*.08;
  vec2 sun = vec2(((uBody.x-.5)*ASP)*.25*uBody.z, sunY-.5);
  vec3 col;
  if(uv.y > hz){
    float t = (uv.y-hz)/(1.-hz);
    col = mix(vec3(1.,.80,.66), vec3(.42,.60,.72), pow(t,.55));
    float c = fbm(vec2(p.x*1.2 + uTime*.008, uv.y*5.));
    col = mix(col, vec3(1.,.93,.88), smoothstep(.45,.8,c)*.35*t);
    float sd = length(p-sun);
    col += vec3(1.,.92,.78)*smoothstep(.065+uAudio.x*.015, .058, sd)*.7;
  } else {
    float d = hz-uv.y;
    vec2 q = vec2(p.x/(d+.04), 1./(d+.04))*.35;
    float w = fbm(q*vec2(1.5,.8) + vec2(0., uTime*.18));
    w += .35*noise(q*4. + vec2(uTime*.3, 0.))*(.4+uAudio.z);
    col = mix(vec3(.97,.74,.62), vec3(.14,.33,.42), smoothstep(0.,.32,d));
    col += (w-.55)*.10*(1.+uAudio.x*1.5);
    float streak = exp(-abs(p.x-sun.x)*(6.+d*24.))*smoothstep(.35,.9,w+.3);
    col += vec3(1.,.84,.68)*streak*(.35+uAudio.y*.6)*(1.-d*1.6);
    for(int k=0;k<2;k++){
      vec3 h = k==0 ? uH0 : uH1;
      if(h.z>0.){
        vec2 hp = toP(vec2(h.x, min(h.y, hz-.01)));
        float r = length((p-hp)*vec2(1.,2.6));
        float ring = (sin(r*55. - uTime*5.)*.5+.5)*exp(-r*5.);
        col += vec3(1.,.92,.82)*ring*h.z*.28;
      }
    }
  }
  col += vec3(1.,.88,.72)*exp(-length(p-sun)*3.5)*(.25+.35*uMove.y+.2*uAudio.x);
  return col;
}

// ---------- 1 · LIGHTWELL : a beam, a gathering orb, the keeper's flame ----------
vec3 lightwell(vec2 uv, vec2 p){
  vec3 col = mix(vec3(.03,.04,.11), vec3(.11,.07,.20), uv.y);
  float star = step(.996, hash(floor(uv*vec2(uRes.x/uRes.y,1.)*180.)));
  col += star*(.3+.7*noise(uv*40.+uTime))*.35;
  float bx = sin(uTime*.06)*.12 + (uBody.x-.5)*ASP*.35*uBody.z;
  float bw = .07 + uAudio.x*.05 + uMove.z*.12;
  float bc = bx + (uv.y-1.)*.08;
  float beam = exp(-pow((p.x-bc)/bw, 2.))*smoothstep(-.55,.45,p.y);
  float dust = fbm(p*vec2(4.,1.6) + vec2(0., -uTime*.06));
  col += vec3(1.,.84,.58)*beam*(.18+.6*dust)*(.55+uAudio.w*.8);
  vec2 mc = p*60. + vec2(0., uTime*1.5);
  float mh = hash(floor(mc));
  float mote = step(.975 - uAudio.z*.04, mh)*smoothstep(.35, 0., length(fract(mc)-.5));
  col += vec3(1.,.95,.8)*mote*beam*(.6 + .4*sin(uTime*3. + mh*40.));
  vec2 oc = vec2(bx, -.06 + uMove.z*.08);
  float r = .035 + uMove.y*.15 + uAudio.x*.025 + uBeat*.01;
  float od = length(p-oc);
  col += vec3(1.,.9,.7)*(smoothstep(r, r*.55, od)*.85 + exp(-od/(r+.02)*1.3)*.45);
  col += vec3(1.,.75,.45)*glow(p,uH0,.09)*.7 + vec3(.6,.75,1.)*glow(p,uH1,.09)*.7;
  return col;
}

// ---------- 2 · UNDERTOW : deep water, caustics, the pull below ----------
vec3 undertow(vec2 uv, vec2 p){
  vec2 q = p*2.6;
  for(int k=0;k<2;k++){
    vec3 h = k==0 ? uH0 : uH1;
    if(h.z>0.){ vec2 d = p-toP(h.xy); q += d/(dot(d,d)*30.+.6)*h.z*.6; }
  }
  // caustics: two drifting layers of ridged noise, multiplied so only the
  // bright crossings survive, like light folded by a moving surface
  float t = uTime*.12;
  vec2 w = q + vec2(fbm(q+t), fbm(q-t+3.1))*.8;
  float l1 = 1. - abs(noise(w*2.2 + vec2(t*1.3, -t)) - .5)*2.;
  float l2 = 1. - abs(noise(w*2.9 - vec2(t, t*1.1) + 5.) - .5)*2.;
  float caus = pow(l1, 6.)*pow(l2, 6.)*2.5 + pow(l1, 18.)*.6;
  vec3 col = mix(vec3(.01,.04,.08), vec3(.04,.22,.30), pow(uv.y,1.3));
  col += vec3(.45,.85,.88)*caus*(.18+uAudio.x*.55+uMove.y*.25)*(.25+uv.y);
  float rays = fbm(vec2(p.x*3.5 + p.y*1.2, uTime*.04));
  col += vec3(.25,.55,.6)*pow(rays,3.)*smoothstep(-.4,.6,p.y)*(.6+uMove.y*.8);
  col *= .85 + .3*uAudio.w;
  col += vec3(.5,.9,.9)*(glow(p,uH0,.07)+glow(p,uH1,.07))*.25;
  return col;
}

// ---------- 3 · PRISM : stained light that fractures with motion, heals in stillness ----------
vec3 prism(vec2 uv, vec2 p){
  vec2 g = p*5.;
  vec2 ip = floor(g), fp = fract(g);
  float f1 = 9., f2 = 9.; vec2 id = vec2(0.);
  float shake = .15 + uMove.x*.9;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 o = vec2(float(x), float(y));
    vec2 cid = ip+o;
    vec2 pt = vec2(hash(cid), hash(cid+7.1));
    pt = .5 + .4*sin(uTime*.25*shake + 6.28*pt);
    vec2 wp = (cid+pt)/5.;
    for(int k=0;k<2;k++){
      vec3 h = k==0 ? uH0 : uH1;
      if(h.z>0.){ vec2 d = wp - toP(h.xy); pt += d/(dot(d,d)*60.+.5)*h.z*1.2; }
    }
    float d = length(o+pt-fp);
    if(d<f1){ f2=f1; f1=d; id=cid; } else if(d<f2){ f2=d; }
  }
  float hsh = hash(id);
  vec3 jewel = .5 + .5*cos(6.28*(hsh*.6 + uTime*.015 + vec3(0.,.33,.67)));
  jewel = mix(jewel, vec3(.95,.75,.45), .25);
  float back = .45 + .55*exp(-length(p-vec2(0.,.45))*1.4);
  jewel *= back*(.55 + .35*uAudio.w + .4*uBeat*step(.6,hsh));
  float edge = f2-f1;
  float lead = smoothstep(.02, .09 - uMove.y*.05, edge);
  vec3 leadCol = mix(vec3(.03,.02,.05), vec3(1.,.8,.5), uMove.y*.9);
  vec3 col = mix(leadCol, jewel, lead);
  col += vec3(1.,.9,.8)*(glow(p,uH0,.1)+glow(p,uH1,.1))*.25;
  return col;
}

// ---------- 4 · BLOOM : garden, unfolding, return ----------
vec3 bloom(vec2 uv, vec2 p){
  vec2 c = mix(vec2(0.,-.02), toP(uBody.xy)*vec2(1.,.5), uBody.z*.4);
  vec2 d = p-c;
  float r = length(d), a = atan(d.y, d.x);
  vec3 col = mix(vec3(.30,.46,.36), vec3(.88,.90,.74), uv.y);
  col = mix(col, vec3(.96,.95,.84), fbm(p*2. + uTime*.01)*.35);
  float open = .16 + uMove.y*.22 + uMove.w*.12 + uAudio.x*.05;
  for(int k=0;k<4;k++){
    float fk = float(k);
    float rk = open*(1.25 - fk*.25) * (1. + uBeat*.04);
    float n = 5. + fk*2.;
    float dir = mod(fk,2.)<.5 ? 1. : -1.;
    float edge = r - rk*(.75 + .25*cos(a*n + uTime*.05*dir + fk));
    vec3 pc = k==0 ? vec3(.36,.62,.48) : k==1 ? vec3(.91,.62,.56) : k==2 ? vec3(.97,.82,.48) : vec3(1.,.97,.88);
    float m = smoothstep(.012, -.012, edge);
    float vein = .9 + .1*sin(a*n*4. + r*40.);
    col = mix(col, pc*vein, m*.72);
  }
  col += vec3(1.,.97,.85)*exp(-r*18./(1.+uMove.y))*.6;
  col += vec3(1.,.95,.75)*(glow(p,uH0,.08)+glow(p,uH1,.08))*.3;
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
  // stillness reward: a slow ring of light leaving the body
  if(uPulse > 0.){
    vec2 bc = uBody.z>0. ? toP(uBody.xy) : vec2(0.);
    float rr = (1.-uPulse)*1.4;
    float ring = exp(-pow((length(p-bc)-rr)*14., 2.));
    col += vec3(1.,.95,.85)*ring*uPulse*.5;
  }
  // body presence: a faint warmth where you stand
  if(uBody.z>0.) col += vec3(1.,.95,.9)*exp(-length(p-toP(uBody.xy))*3.)*.05*uBody.z;
  col *= 1. - .35*smoothstep(.45, 1.1, length(p*vec2(.8,1.)));
  col += (hash(uv*uRes + fract(uTime)*100.)-.5)*.025;
  gl_FragColor = vec4(clamp(col,0.,1.), 1.);
}
`;
