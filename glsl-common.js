// Shared GLSL: maths, noise, SDFs, the B-17 plan-view SDF (built from model.js numbers),
// the hole field lookup, and the "subject" scene (one shape rendered in one art medium).
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.glsl = H.glsl || {};

  H.glsl.common = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318531
#define PAD 2.5
float sat(float x) { return clamp(x, 0., 1.); }
vec2 sat(vec2 x) { return clamp(x, 0., 1.); }
vec3 sat(vec3 x) { return clamp(x, 0., 1.); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float luma(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float ease(float x) { x = sat(x); return x * x * (3. - 2. * x); }

// hashes without sine (Dave Hoskins)
float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

// value noise 0..1, gradient noise about -1..1
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6. - 15.) + 10.);
  float a = dot(hash22(i) * 2. - 1., f), b = dot(hash22(i + vec2(1, 0)) * 2. - 1., f - vec2(1, 0));
  float c = dot(hash22(i + vec2(0, 1)) * 2. - 1., f - vec2(0, 1)), d = dot(hash22(i + vec2(1, 1)) * 2. - 1., f - vec2(1, 1));
  return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 FBM_M = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = FBM_M * p; a *= .5; } return s / .96875; }
float fbm3(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = FBM_M * p; a *= .5; } return s / .875; }
// domain-warped fbm, for ink, smoke, marble
float warp(vec2 p, float t) { vec2 q = vec2(fbm3(p + vec2(0., t)), fbm3(p + vec2(5.2, 1.3 - t))); return fbm(p + 2.5 * q); }

// Voronoi: x = distance to nearest point, y = distance to the cell border, z = cell id 0..1
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0), mr = vec2(0);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), r = g + hash22(n + g) - f;
    if (dot(mr - r, mr - r) > 1e-5) bd = min(bd, dot(.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(sqrt(md), bd, hash21(n + mg));
}

// signed distance functions (negative inside)
float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * sat(dot(pa, ba) / dot(ba, ba))); }
float sdUCap(vec2 p, vec2 a, float ra, vec2 b, float rb) {
  vec2 pa = p - a, ba = b - a; float h = sat(dot(pa, ba) / dot(ba, ba));
  return length(pa - ba * h) - mix(ra, rb, h);
}
float sdPoly4(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
  vec2 v[4] = vec2[4](v0, v1, v2, v3);
  float d = 1e9, s = 1.;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i], b = w - e * sat(dot(w, e) / dot(e, e));
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}
float smin(float a, float b, float k) { float h = sat(.5 + .5 * (b - a) / k); return mix(b, a, h) - k * h * (1. - h); }
// five-pointed star, r = outer radius (for the national insignia)
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292), k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x); p -= 2. * max(dot(k1, p), 0.) * k1; p -= 2. * max(dot(k2, p), 0.) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1); float h = clamp(dot(p, ba) / dot(ba, ba), 0., r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(TAU * (c * t + d)); }
// anti-aliased fill / line helpers: w is the pixel footprint in world units (see gPix)
float fill(float d, float w) { return sat(.5 - d / w); }
float stroke(float d, float r, float w) { return sat(.5 - (abs(d) - r) / w); }
`;

  // The plane, generated from the model's numbers so JS and GLSL agree exactly.
  H.glsl.plane = M => {
    const G = M.GEO, f = x => x.toFixed(4), v2 = (x, y) => `vec2(${f(x)}, ${f(y)})`;
    const cap = c => `sdUCap(p, ${v2(c[0], c[1])}, ${f(c[2])}, ${v2(c[3], c[4])}, ${f(c[5])})`;
    const nac = ([nx, r]) => `sdUCap(p, ${v2(nx, M.LE(nx) + G.NAC_F)}, ${f(r * .9)}, ${v2(nx, M.LE(nx) - G.NAC_B)}, ${f(r * .7)})`;
    const poly = v => `sdPoly4(p, ${v.map(q => v2(q[0], q[1])).join(", ")})`;
    const fronts = M.engineFronts();
    return /* glsl */ `
// ---- B-17 in plan view: wingspan 2 units, nose toward +y ----
float pl_fus(vec2 p) { return min(min(${cap(G.FUS[0])}, ${cap(G.FUS[1])}), ${cap(G.FUS[2])}); }
float pl_nac(vec2 p) { p.x = abs(p.x); return min(${nac(G.NAC[0])}, ${nac(G.NAC[1])}); }
float pl_wing(vec2 p) { p.x = abs(p.x); return ${poly(G.WING)} - ${f(G.WING_R)}; }
float pl_tail(vec2 p) { p.x = abs(p.x); return ${poly(G.TAIL)} - ${f(G.TAIL_R)}; }
float planeD(vec2 p) {
  if (dot(p, p) > 1.35) return length(p) - 1.05;   // cheap outside the bounding circle
  return min(min(pl_fus(p), pl_nac(p)), min(pl_wing(p), pl_tail(p)));
}
// 0 engines, 1 wings and tail, 2 fuselage, -1 outside
int planeZone(vec2 p) {
  if (pl_nac(p) < 0.) return 0;
  if (pl_fus(p) < 0.) return 2;
  if (min(pl_wing(p), pl_tail(p)) < 0.) return 1;
  return -1;
}
// signed distance to one zone's region (for outlines and armour plates)
float zoneD(vec2 p, int z) {
  float n = pl_nac(p), fu = pl_fus(p), w = min(pl_wing(p), pl_tail(p));
  if (z == 0) return n;
  if (z == 2) return max(fu, -n);
  return max(w, -min(fu, n));
}
// propellers seen edge-on: distance to the four prop lines just ahead of the nacelles
float planeProps(vec2 p) {
  p.x = abs(p.x);
  return min(sdSeg(p, ${v2(G.NAC[0][0] - .11, M.LE(G.NAC[0][0]) + G.NAC_F + .012)}, ${v2(G.NAC[0][0] + .11, M.LE(G.NAC[0][0]) + G.NAC_F + .012)}),
             sdSeg(p, ${v2(G.NAC[1][0] - .11, M.LE(G.NAC[1][0]) + G.NAC_F + .012)}, ${v2(G.NAC[1][0] + .11, M.LE(G.NAC[1][0]) + G.NAC_F + .012)}));
}
const vec2 ENGINE_FRONT[4] = vec2[4](${fronts.map(e => v2(e[0], e[1])).join(", ")});
`;
  };

  // Scene 0: the subject. One shape (a great arc or the plane, morphing between them) drawn in one medium.
  H.glsl.subject = /* glsl */ `
struct Hole { bool on; vec2 o; float r; float seed; int kind; float dens; float densLost; float fresh; float gold; };
// kind: 1 came home, 2 lost, 3 came home (the viewer's plane), 4 lost (the viewer's plane)
Hole holeAt(vec2 suv) {
  vec4 c = texture(uHole, suv), g = texture(uGlow, suv);
  Hole h;
  h.on = c.a > .05; h.o = (c.rg * 2. - 1.) * PAD; h.r = h.on ? length(h.o) : 99.; h.seed = c.b; h.kind = int(c.a * 4. + .5);
  h.dens = g.r; h.densLost = g.g; h.fresh = g.b; h.gold = g.a;
  return h;
}

// Globals every medium may read (set by sceneSubject before calling medium()).
vec2 gLocal;   // plane-space position (the nearest copy of the plane when split), or arc-local position
int gZone;     // zone under this pixel, -1 outside or for the arc
float gSide;   // -1 the 'came home' copy, +1 the 'never came back' copy, 0 when not split
float gPix;    // size of one pixel in world units (for anti-aliasing)

float subjectArc(vec2 p) { return length(p - vec2(0., uArc.x - uArc.y)) - uArc.y; }
vec2 toPlane(vec2 p) { return rot(-uPlane.w) * (p - uPlane.xy) / uPlane.z; }
float subjectPlane(vec2 p) {
  vec2 q = toPlane(p);
  float d = uSplit > .001 ? min(planeD(q + vec2(uSplit, 0.)), planeD(q - vec2(uSplit, 0.))) : planeD(q);
  return d * uPlane.z;
}
float subjectD(vec2 p) {
  if (uShape <= 0.) return subjectArc(p);
  if (uShape >= 1.) return subjectPlane(p);
  return mix(subjectArc(p), subjectPlane(p), ease(uShape));
}
`;

  // the part of the subject scene that runs after the media are declared
  H.glsl.subjectMain = /* glsl */ `
vec3 goldGlow(float k) { return vec3(1., .78, .38) * k; }
// the ghosts of the lost planes (the director's rows 8 and 9), lit like paper lanterns; uFX2.w = how many
vec3 ghostLayer(vec2 p, vec3 col) {
  int n = int(uFX2.w);
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    vec4 g = row(8, i), s = row(9, i);
    if (s.x < .01) continue;
    vec2 dp = p - g.xy;
    float r = length(dp) / g.w;
    if (r > 1.7) continue;
    float d = planeD(rot(-g.z) * dp / g.w) * g.w;
    vec3 tint = mix(vec3(.9, .2, .12), vec3(1., .8, .4), s.z);
    float body = fill(d, gPix * 1.5), inner = .3 + .7 * exp(d / (.07 * g.w));
    col = mix(col, col * .35 + tint * inner * 1.1, body * s.x * .8);
    col += tint * exp(-max(d, 0.) / (.05 * g.w)) * (1. - smoothstep(1.05, 1.7, r)) * s.x * .4 * (.5 + s.y);
  }
  return col;
}
vec3 sceneSubject(vec2 p, vec2 q, vec2 suv) {
  gPix = uCam.z / uRes.y;
  float e = 1.5 * gPix;
  float d = subjectD(p);
  vec2 n = vec2(subjectD(p + vec2(e, 0.)) - d, subjectD(p + vec2(0., e)) - d);   // forward differences: two extra evaluations
  n = n / max(length(n), 1e-6);
  vec2 lq = toPlane(p);
  gSide = 0.;
  if (uSplit > .001) { gSide = lq.x < 0. ? -1. : 1.; lq.x += uSplit * -gSide; }
  gLocal = uShape > .5 ? lq : p - vec2(0., uArc.x);
  gZone = uShape > .5 ? planeZone(lq) : -1;
  Hole h = holeAt(suv);
  vec3 col = medium(uMedium, p, d, n, h);

  if (uShape > .5) {
    // hover: the zone under the pointer glows gold at its edge
    if (uFX2.y > 0. && gZone == int(uFX2.x)) {
      float zd = zoneD(lq, gZone) * uPlane.z;
      col = mix(col, col * 1.12 + vec3(.18, .13, .05), uFX2.y * .6);
      col += goldGlow(uFX2.y) * (stroke(zd, .0015 * uCam.z, gPix * 1.5) + .35 * exp(zd / (.012 * uCam.z)));
    }
    // armour: gold-edged steel plates sweep over the chosen zone, nose to tail
    int az = int(uFX.z);
    if (az >= 0 && uFX.w > 0.) {
      float zd = zoneD(lq, az);
      float front = mix(.85, -.85, uFX.w), inZone = fill(zd * uPlane.z, gPix * 1.5), shown = step(front, lq.y);
      vec2 tp = lq * vec2(22., 30.); tp.x += .5 * floor(tp.y);
      vec2 cell = fract(tp) - .5;
      float seam = 1. - smoothstep(.40, .47, max(abs(cell.x), abs(cell.y)));
      float rivet = smoothstep(.09, .05, length(abs(cell) - vec2(.36, .36)));
      vec3 steel = mix(vec3(.24, .26, .29), vec3(.52, .54, .56), .5 + .5 * n.y) * (.85 + .3 * hash21(floor(tp)));
      vec3 plate = mix(vec3(.85, .64, .28), steel, seam) + rivet * vec3(.9, .75, .45);
      float k = inZone * shown;
      col = mix(col, plate, k * .82);
      col += goldGlow(1.4) * inZone * exp(-abs(lq.y - front) * 60.) * (1. - step(1., uFX.w));   // the sweep's leading glint
      col += goldGlow(.9) * stroke(zd * uPlane.z, .001 * uCam.z, gPix * 1.5) * shown;
    }
  }
  // the viewer's own holes wear a gold ring; fresh holes flash as they land
  if (h.on && h.kind >= 3) col = mix(col, vec3(1., .82, .42), stroke(h.r - 1.55, .18, .12) * .95);
  col += goldGlow(1.) * h.gold * .25 + vec3(1., .9, .75) * h.fresh * 1.2;
  if (uFX2.w > 0.) col = ghostLayer(p, col);
  return col;
}
`;
})();
