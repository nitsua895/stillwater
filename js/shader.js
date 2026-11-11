// The five worlds. One fragment shader, crossfading between two.
//
// Three worlds are a fluid your body stirs (Silk, Spectrum, Bloom), rendered as
// different materials. Two show your silhouette (Lightwell, Undertow).
//
//   Silk       warm ribbons of light pulled from your limbs; lows glow from below, highs add sheen
//   Lightwell  lows = the orb breathes · mids = beam · highs = dust; hands together hold the orb
//   Undertow   lows = glow from the deep · mids = caustics · highs = bubbles; stillness brings light
//   Spectrum   you paint with the music's colour (lows red → highs violet), glowing on dark
//   Bloom      watercolour ink on paper; holding still lets the ink bloom outward
// In the fluid worlds: moving limbs stir and paint, your moving outline paints, a held pose
// makes your outline glow, the low end breathes outward from your centre, highs add swirls.

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
uniform sampler2D uDye;     // the fluid your body stirs (Silk, Spectrum, Bloom)
uniform vec2 uDyeTexel;
uniform int uFluidOn;

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

// ---- the fluid you stir ----
vec3 dyeAt(vec2 uv){ return uFluidOn==1 ? max(texture(uDye, uv).rgb, 0.) : vec3(0.); }
vec3 dyeBlur(vec2 uv, float r){
  vec2 e = uDyeTexel*r;
  return (dyeAt(uv+vec2(e.x,0.)) + dyeAt(uv-vec2(e.x,0.)) + dyeAt(uv+vec2(0.,e.y)) + dyeAt(uv-vec2(0.,e.y)))*.25;
}
vec3 tonemap(vec3 c){ return 1. - exp(-c); }

// ============ 0 · SILK : warm ribbons of light pulled from your limbs ============
vec3 silk(vec2 uv, vec2 p){
  vec3 bg = mix(vec3(.035,.03,.06), vec3(.11,.06,.09), uv.y);
  bg += vec3(.10,.05,.04)*exp(-length(p - vec2(0.,-.45))*2.)*(.6 + uAudio.x*.8);   // lows: a warm glow from below
  vec3 d = dyeAt(uv);
  float I = dot(d, vec3(.333));
  // treat the light's density as a surface, and give it a satin sheen
  vec2 e = uDyeTexel*2.;
  float gx = dot(dyeAt(uv+vec2(e.x,0.)) - dyeAt(uv-vec2(e.x,0.)), vec3(.333));
  float gy = dot(dyeAt(uv+vec2(0.,e.y)) - dyeAt(uv-vec2(0.,e.y)), vec3(.333));
  vec3 n = normalize(vec3(-gx*3., -gy*3., 1.));
  float sheen = pow(max(dot(n, normalize(vec3(-.3,.5,.8))), 0.), 24.);
  vec3 col = bg + tonemap(d*1.3) + vec3(1.,.9,.8)*sheen*min(I*2., 1.)*(.35 + uAudio.z*.6);
  col += dyeBlur(uv, 6.)*.25;                                                      // soft halo
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

// ============ 3 · SPECTRUM : you paint with the music's colours ============
// The colour you leave is the colour of the sound right now: lows red-orange,
// mids gold-green, highs blue-violet. Dark room, glowing light.
vec3 spectrum(vec2 uv, vec2 p){
  vec3 bg = mix(vec3(.01,.012,.025), vec3(.03,.025,.05), uv.y);
  vec3 d = dyeAt(uv);
  vec3 col = bg + tonemap(d*1.2);
  col += tonemap(dyeBlur(uv, 5.)*.6)*.45 + tonemap(dyeBlur(uv, 14.)*.5)*.3;      // bloom
  return col;
}

// ============ 4 · BLOOM : watercolour ink on paper ============
// The dye is pigment: your movement lays down ink, and while you hold still it
// keeps spreading like a watercolour bloom.
vec3 bloom(vec2 uv, vec2 p){
  vec3 paper = vec3(.94,.91,.85) - .035*fbm(p*9.) - .02*fbm(p*40.);
  paper *= 1. - .08*smoothstep(.4, 1.1, length(p*vec2(.8,1.)));
  vec3 ink = dyeAt(uv);
  // pigment pools darker at the edges of each wash
  float I = dot(ink, vec3(.333));
  float edge = clamp(length(vec2(dot(dyeAt(uv+vec2(uDyeTexel.x*2.,0.)) - dyeAt(uv-vec2(uDyeTexel.x*2.,0.)), vec3(.333)),
                                 dot(dyeAt(uv+vec2(0.,uDyeTexel.y*2.)) - dyeAt(uv-vec2(0.,uDyeTexel.y*2.)), vec3(.333))))*6., 0., 1.);
  vec3 col = paper*exp(-ink*(1.6 + edge*1.2));
  col *= 1. - .05*fbm(p*25. + I*3.)*min(I*3., 1.);                                 // granulation
  return col;
}

vec3 world(int s, vec2 uv, vec2 p){
  if(s==0) return silk(uv,p);
  if(s==1) return lightwell(uv,p);
  if(s==2) return undertow(uv,p);
  if(s==3) return spectrum(uv,p);
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
