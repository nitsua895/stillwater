// The five worlds. One fragment shader, crossfading between two.
//
// Each world has its own, readable relationship to the music, your hands and
// your stillness (see docs/BRIEF.md → "What each world listens to"):
//
//   Tide       lows = swell height · mids = sky warmth · highs = sun glints on the water
//              arms lift the sun · hands make wakes · stillness turns the sea to glass
//   Lightwell  lows = the orb breathes · mids = beam brightness · highs = dust twinkles
//              bring your hands together to hold the orb · stillness fills you with light
//   Undertow   lows = glow from the deep · mids = caustic light · highs = bubbles
//              hands stir currents · stillness brings a shaft of light down onto you
//   Prism      crystals throwing rainbows on a warm wall; in each, 7 colours = 7 bands (red = lows → violet = highs)
//              each crystal grows with its band, turns with the mids · slow hands gather them, quick hands push & spin
//   Bloom      petal rings = frequency bands · highs = pollen · musical attacks sprout flowers
//              flowers grow near your hands and along your outline; your hands brush them aside

export const WORLD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uAudio;   // slow bass, mid, high, level
uniform float uBands7[7];
uniform vec3 uH0;
uniform vec3 uH1;
uniform vec3 uBody;    // x, y, presence
uniform vec4 uMove;    // motion, stillness, rise, openness
uniform float uPulse;
uniform int uA;
uniform int uB;
uniform float uFade;
uniform sampler2D uSim;
uniform sampler2D uMask;
uniform int uSimOn;
uniform int uMaskOn;
uniform vec2 uCamMap;
uniform vec2 uSimTexel;
uniform vec4 uFlowers[16];  // x, y (uv), growth, hue
uniform vec4 uFlowerB[16];  // openness, rotation, size, 0
uniform int uNFlowers;
uniform vec4 uRain[6];      // crystals: x, y (uv), angle, scale

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
float band(int k){ return uBands7[k]; }

// ---- physics sheet ----
float simH(vec2 uv){ return uSimOn==1 ? texture(uSim, uv).r : 0.; }
vec2 simGrad(vec2 uv){
  if(uSimOn==0) return vec2(0.);
  vec2 e = uSimTexel*1.5;
  return vec2(texture(uSim, uv+vec2(e.x,0.)).r - texture(uSim, uv-vec2(e.x,0.)).r,
              texture(uSim, uv+vec2(0.,e.y)).r - texture(uSim, uv-vec2(0.,e.y)).r);
}
vec2 softG(vec2 g, float k){ return g/(1. + length(g)*k); }
// ---- your form (soft, general shape from the smoothed skeleton) ----
vec3 maskAt(vec2 uv){
  if(uMaskOn==0) return vec3(0.);
  vec2 c = (uv-.5)*uCamMap+.5;
  if(c.x<0. || c.x>1. || c.y<0. || c.y>1.) return vec3(0.);
  return texture(uMask, c).rgb;
}
float body(vec2 uv){ vec3 m = maskAt(uv); return smoothstep(.3, .62, mix(m.r, m.b, .45)); }
vec2 bodyGrad(vec2 uv){   // points into the body
  float e = .008;
  return vec2(maskAt(uv+vec2(e,0.)).b - maskAt(uv-vec2(e,0.)).b, maskAt(uv+vec2(0.,e)).b - maskAt(uv-vec2(0.,e)).b);
}
float rimToward(vec2 uv, vec2 dir){   // edge of the form that faces a light
  vec2 g = bodyGrad(uv);
  return clamp(dot(-normalize(g+1e-5), normalize(dir)), 0., 1.)*clamp(length(g)*7., 0., 1.);
}

// ============ 0 · TIDE ============
vec3 skyCol(vec3 d, vec3 sun){
  float t = clamp(d.y*2.2, 0., 1.);
  vec3 low = mix(vec3(1.,.80,.66), vec3(1.,.72,.55), uAudio.y*.6);   // mids warm the dawn
  vec3 c = mix(low, vec3(.40,.58,.72), pow(t,.55));
  float s = max(dot(d, sun), 0.);
  c += vec3(1.,.86,.68)*(pow(s, 8.)*.45 + pow(s, 600.)*3.);
  return c;
}
vec3 tide(vec2 uv, vec2 p){
  float hz = .45;
  vec3 sun = normalize(vec3(((uBody.x-.5)*ASP)*.2*uBody.z, .02 + uMove.z*.15 + uMove.y*.05, 1.));
  vec2 sunP = vec2(sun.x/sun.z, sun.y/sun.z + hz - .5);
  vec3 rd = normalize(vec3(p.x, uv.y-hz, 1.));
  vec3 col;
  float nearWater = 0.;
  if(rd.y > 0.){
    col = skyCol(rd, sun);
    float c = fbm(vec2(rd.x/(rd.y+.15)*1.2 + uTime*.006, 1./(rd.y+.15)*.9));
    col = mix(col, vec3(1.,.93,.88), smoothstep(.5,.85,c)*.35*smoothstep(0.,.25,rd.y));
  } else {
    float t = -1./rd.y;
    vec3 hit = rd*t;
    vec2 suv = vec2(hit.x/9. + .5, (hit.z-.8)/12.);
    float inSim = smoothstep(1., .85, suv.y)*step(0., suv.y)*smoothstep(0.,.05,suv.x)*smoothstep(1.,.95,suv.x);
    vec2 g = softG(simGrad(clamp(suv,0.,1.)), 3.)*inSim;
    float h = simH(clamp(suv,0.,1.))*inSim;
    // small chop: stillness smooths the sea to glass
    vec2 q = hit.xz*vec2(.9,.6);
    float ch = (.55 + .45*uAudio.z)*(1. - uMove.y*.8);
    vec2 pg = vec2(noise(q*3.+uTime*.4)-noise(q*3.+vec2(.1,0.)+uTime*.4), noise(q*2.7-uTime*.35)-noise(q*2.7+vec2(0.,.1)-uTime*.35))*ch;
    vec3 n = normalize(vec3(-(g.x*5.+pg.x*1.2), 1., -(g.y*5.+pg.y*1.2)));
    vec3 r = reflect(rd, n); r.y = abs(r.y);
    float fres = .03 + .97*pow(1. - max(dot(-rd, n), 0.), 5.);
    vec3 deep = mix(vec3(.10,.28,.36), vec3(.18,.42,.48), clamp(h*2.+.5, 0., 1.));
    col = mix(deep, skyCol(r, sun), fres);
    // highs: glints of sun dancing on the surface
    col += vec3(1.,.9,.75)*pow(max(dot(r, sun), 0.), 220.)*(.6 + uAudio.z*2.5);
    col += vec3(1.,.9,.75)*clamp(h, 0., 1.)*.2;
    col = mix(col, skyCol(normalize(vec3(rd.x,.0,1.)), sun), smoothstep(25.,90.,t)*.8);
  }
  return col;
}

// ============ 1 · LIGHTWELL ============
vec3 lightwell(vec2 uv, vec2 p){
  vec3 col = mix(vec3(.03,.04,.11), vec3(.11,.07,.20), uv.y);
  float star = step(.996, hash(floor(uv*vec2(ASP,1.)*180.)));
  col += star*(.3+.7*noise(uv*40.+uTime*.3))*.3;
  float air = simH(uv);
  float bx = sin(uTime*.04)*.12 + (uBody.x-.5)*ASP*.35*uBody.z;
  float bw = .07 + uMove.w*.1 + uMove.z*.06;
  float bc = bx + (uv.y-1.)*.08;
  float beam = exp(-pow((p.x-bc)/bw, 2.))*smoothstep(-.55,.45,p.y);
  float dust = fbm(p*vec2(4.,1.6) + vec2(0., -uTime*.035))*(.85 + air*.6);
  col += vec3(1.,.84,.58)*beam*(.12+.55*max(dust,0.))*(.45 + uAudio.y*1.1);    // mids: beam brightness
  vec2 mc = p*60. + vec2(0., uTime*.8);
  float mh = hash(floor(mc));
  float tw = .5 + .5*sin(uTime*(1. + mh*2.) + mh*40.);
  float mote = step(.982, mh)*smoothstep(.35, 0., length(fract(mc)-.5));
  col += vec3(1.,.95,.8)*mote*(beam*1.3+.08)*tw*(.4 + uAudio.z*1.6);           // highs: dust twinkles
  // the orb: hands brought together hold it; lows make it breathe
  vec2 oc = vec2(bx, -.06 + uMove.z*.08);
  if(uH0.z>0. && uH1.z>0.){
    vec2 a = toP(uH0.xy), b2 = toP(uH1.xy);
    float near = smoothstep(.38, .14, length(a-b2));
    oc = mix(oc, (a+b2)*.5, near);
  }
  float r = .03 + uMove.y*.12 + uAudio.x*.045 + uPulse*.03;
  float od = length(p-oc);
  col += vec3(1.,.9,.7)*(smoothstep(r, r*.55, od)*.85 + exp(-od/(r+.02)*1.3)*.45);
  // your hands carry a little warmth
  col += vec3(1.,.8,.55)*(glow(p,uH0,.05)+glow(p,uH1,.05))*.3;
  // you: dark shape in the dark room, rim-lit by the beam, filling with light as you still
  float b = body(uv);
  if(b>0.){
    float rim = rimToward(uv, vec2(bc - p.x, .6));
    float inner = fbm(p*5. + vec2(0., -uTime*.15))*uMove.y*.75;
    vec3 fig = vec3(.02,.02,.05) + vec3(1.,.82,.55)*inner*.8 + vec3(1.,.9,.7)*uMove.y*.12;
    col = mix(col, fig, b*.9);
    col += vec3(1.,.88,.62)*rim*(.8 + beam);
  }
  return col;
}

// ============ 2 · UNDERTOW ============
vec3 undertow(vec2 uv, vec2 p){
  vec2 g = softG(simGrad(uv), 4.);
  vec2 q = p*2.4 + g*2.5;
  float t = uTime*.05;
  vec2 w = q + vec2(fbm(q+t), fbm(q-t+3.1))*.8;
  float l1 = 1. - abs(noise(w*2.2 + vec2(t*1.3, -t)) - .5)*2.;
  float l2 = 1. - abs(noise(w*2.9 - vec2(t, t*1.1) + 5.) - .5)*2.;
  float caus = pow(l1, 6.)*pow(l2, 6.)*2.5 + pow(l1, 18.)*.6;
  vec3 col = mix(vec3(.01,.035,.07), vec3(.04,.20,.28), pow(uv.y,1.3));
  col += vec3(.45,.85,.88)*caus*(.10 + uAudio.y*.55)*(.25+uv.y);                // mids: caustic light
  float rays = fbm(vec2(p.x*3. + p.y*1.2, uTime*.02));
  col += vec3(.25,.55,.6)*pow(rays,3.)*smoothstep(-.4,.6,p.y)*.6;
  col += vec3(.04,.18,.22)*uAudio.x*1.6*smoothstep(.2,-.55,p.y);                // lows: glow from the deep
  // stillness: a shaft of light finds you from the surface
  float sx = uBody.z>0. ? toP(uBody.xy).x : 0.;
  float shaft = exp(-pow((p.x - sx - (uv.y-1.)*.05)/(.07 + .03*sin(uTime*.2)), 2.))*smoothstep(-.6,.5,p.y);
  col += vec3(.55,.85,.85)*shaft*uMove.y*.45;
  // you: a calm dark form, light moving across you
  float b = body(uv);
  if(b>0.){
    vec3 fig = vec3(.01,.045,.07) + vec3(.4,.8,.85)*caus*.18 + vec3(.3,.6,.6)*shaft*uMove.y*.35;
    col = mix(col, fig, b*.85);
    col += vec3(.45,.9,.95)*rimToward(uv, vec2(0.,1.))*.35;
  }
  return col;
}

// ============ 3 · PRISM : morning sun through hanging crystals ============
// Soft rainbows drift across a warm wall. In every rainbow, each colour is one
// frequency band (red = lows ... violet = highs), so you can see the music's shape.
vec3 spectral(float t){
  vec3 c = clamp(abs(fract(t + vec3(0.,.666,.333))*6.-3.)-1., 0., 1.);
  return mix(c, vec3(1.), .15);
}
// crystals hang in the light; each throws a rainbow. Their positions, spin and
// size come from a small physics sim (main.js): your hands gather and push them,
// the music makes them grow and turn.
vec3 crystals(vec2 p, out float glass){
  vec3 acc = vec3(0.);
  glass = 0.;
  float spread = mix(1., .12, uMove.y);                 // stillness: colours gather into one
  for(int i=0;i<6;i++){
    vec4 R = uRain[i];
    vec2 c = toP(R.xy);
    float ang = R.z, sc = R.w;
    vec2 ax = vec2(cos(ang), sin(ang));
    vec2 d = p - c;
    // the crystal: a small soft hexagon of glass
    // the crystal itself: a faint, softly faceted glint, not an outline
    vec2 q = abs(mat2(ax.x, -ax.y, ax.y, ax.x)*d);
    float gem = q.x*.7 + q.y - .012*(.8 + sc*.4);
    float facet = .5 + .5*sin(atan(d.y, d.x)*3. + ang*2.);
    glass += smoothstep(.006, -.006, gem)*(.10 + .12*facet);
    glass += exp(-dot(d,d)/.00004)*.35;
    // its rainbow, thrown out along its axis
    vec2 o = c + ax*.012;
    vec2 e = p - o;
    float u = dot(e, ax), v = dot(e, vec2(-ax.y, ax.x));
    float len = (.12 + .06*sc)*spread;
    float wid = .025 + .02*sc;
    float across = exp(-v*v/(wid*wid))*smoothstep(-.01, .02, u)*smoothstep(1.25*len, .9*len, u);
    float hueOff = sin(uTime*.02 + float(i)*1.3)*.06 + uAudio.y*.12;   // mids shift the colours
    vec3 col = vec3(0.);
    for(int k=0;k<7;k++){
      float pos = (float(k)/6.)*len;
      float w = exp(-pow((u - pos)/(len*.11 + .005), 2.));
      col += spectral(fract(float(k)/7.*.78 + hueOff))*w*(.10 + band(k)*.75);
    }
    acc += col*across;
  }
  return acc;
}
vec3 prism(vec2 uv, vec2 p){
  vec3 col = mix(vec3(.30,.26,.24), vec3(.44,.39,.35), uv.y);
  col += vec3(.06,.05,.04)*(fbm(p*3.) - .5);
  col += vec3(.10,.08,.05)*exp(-pow(length((p - vec2(.25*ASP*.5, .15))*vec2(.8,1.)), 2.)*4.);
  float glass;
  vec3 light = crystals(p, glass);
  col += light*.95;
  col += vec3(1.,.97,.92)*glass*(.5 + uAudio.z*1.2);       // highs: glints in the glass
  // your hands carry a faint warm light
  col += vec3(1.,.92,.8)*(glow(p,uH0,.05)+glow(p,uH1,.05))*.12;
  return col;
}

// ============ 4 · BLOOM ============
vec3 flower(vec2 p, vec4 f, vec4 fb, inout vec3 col){
  vec2 d = p - toP(f.xy);
  float s = .05*f.z*fb.z;
  if(s < .002) return col;
  float r = length(d);
  if(r > s*1.6) return col;
  float a = atan(d.y, d.x) + fb.y;
  float np = 5. + floor(f.w*3.);
  float open = fb.x;
  // petals: length opens with the music, a soft cup when closed
  float petal = s*mix(.45, 1., open)*(.55 + .45*pow(abs(cos(a*np*.5)), 1.5 - open*.8));
  vec3 pc = mix(vec3(1.,.72,.68), vec3(1.,.88,.55), f.w);
  pc = mix(pc, vec3(.86,.70,.95), step(.75, f.w)*.6);
  float m = smoothstep(petal, petal*.82, r);
  col = mix(col, col*.75, smoothstep(petal*1.25, petal, r)*.25);           // soft shadow
  col = mix(col, pc*(.8 + .25*(1. - r/max(petal,.001))), m*.92);
  col = mix(col, vec3(1.,.83,.42), smoothstep(s*.2, s*.12, r));
  return col;
}
vec3 bloom(vec2 uv, vec2 p){
  vec2 c = mix(vec2(0.,-.02), toP(uBody.xy)*vec2(1.,.5), uBody.z*.4);
  vec2 g = softG(simGrad(uv), 5.);
  vec3 n = normalize(vec3(-g*2., 1.));
  float shade = .8 + .35*dot(n, normalize(vec3(-.4,.6,.7)));
  vec2 d = p-c;
  float r = length(d), a = atan(d.y, d.x);
  vec3 col = mix(vec3(.30,.46,.36), vec3(.88,.90,.74), uv.y);
  col = mix(col, vec3(.96,.95,.84), fbm(p*2. + uTime*.006)*.35);
  float open = .15 + uMove.y*.22 + uMove.w*.10;
  for(int k=0;k<4;k++){
    float fk = float(k);
    float bnd = band(1 + k + k/2);                     // outer ring = lows ... inner ring = highs
    float rk = open*(1.25 - fk*.25)*(1. + bnd*.22);
    float nn = 5. + fk*2.;
    float dir = mod(fk,2.)<.5 ? 1. : -1.;
    float edge = r - rk*(.75 + .25*cos(a*nn + uTime*.03*dir + fk));
    vec3 pc = k==0 ? vec3(.36,.62,.48) : k==1 ? vec3(.91,.62,.56) : k==2 ? vec3(.97,.82,.48) : vec3(1.,.97,.88);
    float m = smoothstep(.012, -.012, edge);
    float vein = .96 + .04*sin(a*nn*4. + r*40.);
    col = mix(col, pc*vein*shade, m*.75);
  }
  col += vec3(1.,.97,.85)*exp(-r*18./(1.+uMove.y))*.5;
  // pollen drifting up, twinkling with the highs
  vec2 pc2 = p*28. + vec2(sin(uTime*.1)*2., -uTime*.25);
  float ph = hash(floor(pc2));
  col += vec3(1.,.95,.7)*step(.985, ph)*smoothstep(.3, 0., length(fract(pc2)-.5))*(.25 + uAudio.z*1.4);
  // flowers that sprouted around you with the music
  for(int i=0;i<16;i++){
    if(i>=uNFlowers) break;
    col = flower(p, uFlowers[i], uFlowerB[i], col);
  }
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
  col *= 1. - .35*smoothstep(.45, 1.1, length(p*vec2(.8,1.)));
  col += (hash(uv*uRes + fract(uTime)*100.)-.5)*.02;
  outColor = vec4(clamp(col,0.,1.), 1.);
}
`;
