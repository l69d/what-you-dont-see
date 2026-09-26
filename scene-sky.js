// Scene 1, the raid: the viewer rides in one B-17 of a combat box over Germany at dawn, 1943, seen from high above
// the cloud deck. It may or may not come home.
//
// update(t, L, E, ctx) reads ctx.your (the viewer's sortie), ctx.claimAt (scene time of the click on their plane, or
// null while waiting) and ctx.lab. Combat time is c = t - claimAt; `beats` holds the shot list's times relative to it.
// World = the formation's frame: north up, the box's centre near the origin. The air (clouds, contrails, smoke, flak,
// parachutes) streams past it by D(t). Depth below the formation is g: seen by a camera whose visible height is zoom,
// a layer at depth g appears scaled by 1 / (1 + g / zoom), which gives the parallax as the camera moves.
//
// Data rows (128 texels each):
//   0-2  planes drawn: (x, y, heading, scale) (roll, alpha, contrail, fire) (fire x, fire y in plane space, gold, depth)
//   3    flak bursts (x, y, radius, age): 0.. below the formation, 64.. above it
//   4    smoke trails (x, y, width, density): 0.. the other bomber, 32.. yours; 64.. deck shadows (x, y, heading, scale)
//   5    parachutes 0.. (x, y, radius, open); fighters 32.. (x, y, heading, scale) and 40.. (roll, alpha, guns, depth);
//        your holes 64.. (x, y in plane space, time, radius)
// uP: [0] air x, air y, flare, clock  [1] planes, bursts below, bursts above, fighters  [2] chutes, holes, your index, c
//     [3] shadows, trail A points, trail B points, contrail bend  [4] sun x, sun y, veil, sparks  [5] flash x, y, radius, power
//     [6] trail A box  [7] trail B box
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.scenes = H.scenes || {};

  const glsl = /* glsl */ `
// ---------------- scene 1: the raid ----------------
const float SKY_G1 = 2.2, SKY_G2 = 6., SKY_G3 = 45.;
float skyT, skyFlare; vec2 skyAir, skySun; vec3 skyL;
// the formation-frame point at depth g that is seen at p
vec2 sky_at(vec2 p, float g) { return uCam.xy + (p - uCam.xy) * (1. + g / uCam.z); }

// value noise and fbm with analytic gradients (x value, yz gradient), for lit cloud tops
vec3 sky_vnd(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f), du = 6. * f * (1. - f);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
// five octaves; lo = the first two alone (the big forms), same normalisation
vec3 sky_fbmd(vec2 p, out vec3 lo) {
  vec3 s = vec3(0.); float a = .5; mat2 m = mat2(1.);
  for (int i = 0; i < 5; i++) { vec3 n = sky_vnd(p); s += a * vec3(n.x, n.yz * m); if (i == 1) lo = s / .75; p = FBM_M * p; m = FBM_M * m; a *= .5; }
  return s / .96875;
}

// the patchwork far below: irregular fields, hedgerows, woods and a river holding the dawn sky
vec3 sky_ground(vec2 a) {
  vec2 r = rot(.45) * a * .55;
  r += (vec2(vnoise(r * .23), vnoise(r * .23 + 9.1)) - .5) * 2.4;          // fields are never square
  float row = floor(r.y), sx = .5 + 1.2 * hash11(row * 1.37 + 4.1), fx = r.x * sx + 9. * hash11(row + .5);
  vec2 id = vec2(floor(fx), row), f = vec2(fract(fx), fract(r.y));
  float h = hash21(id);
  vec3 c = h < .3 ? vec3(.25, .31, .19) : h < .52 ? vec3(.38, .36, .24) : h < .7 ? vec3(.30, .25, .19) : h < .88 ? vec3(.20, .27, .17) : vec3(.44, .42, .32);
  c *= .82 + .3 * hash21(id + 7.3);
  float edge = min(min(f.x, 1. - f.x) / sx, min(f.y, 1. - f.y));
  c = mix(c * .78, c, smoothstep(0., .05, edge));
  float wood = fbm3(a * .045);
  c = mix(c, vec3(.08, .12, .09), smoothstep(.54, .6, wood));
  vec2 rr = rot(-.5) * a;
  float dr = abs(rr.x - 16. * sin(rr.y * .018) - 7. * sin(rr.y * .047 + 2.) - (wood - .5) * 14. - 12.);
  c = mix(c, vec3(.1, .12, .1), smoothstep(2.4, 1.5, dr));
  return mix(c, vec3(.58, .56, .62), smoothstep(1.1, .7, dr));
}

// the cumulus deck: domes lit from the side by the low sun. Returns colour and coverage; skyGap = how shaded the gap is
float skyGap;
vec4 sky_deck(vec2 a) {
  vec2 u = a * .2;
  u += (vec2(vnoise(u * .5 + 3.1), vnoise(u * .5 + 17.7)) - .5) * 1.8;     // break up the lattice
  vec3 lo, n = sky_fbmd(u, lo);
  float det = vnoise(u * 9.3) - .5;                                           // small puffs at the edges
  float h = sat((n.x + det * .05 - .43) / .17), hs = sqrt(h);
  skyGap = smoothstep(.22, .43, n.x);
  // normal: the dome of the whole cloud from the big forms (steep at its edge, flat on top), plus the billows on it
  float hl = sqrt(sat((lo.x - .4) / .2));
  vec2 gd = lo.yz * (.5 / .2) / max(hl, .25);
  vec3 N = normalize(vec3(-gd * .1 - (n.yz - lo.yz * .77) * .22, 1.));
  float lit = sat(dot(N, skyL) * .75 + .3);
  vec3 sunC = mix(vec3(1.02, .8, .6), vec3(1.1, .8, .46), skyFlare);
  vec3 c = mix(vec3(.19, .22, .33), vec3(.53, .5, .54), smoothstep(0., .45, lit));
  c = mix(c, sunC, smoothstep(.4, .88, lit));
  c *= mix(.7, 1.05, hs) * (1. + det * .1);
  c += sunC * .35 * (1. - hs) * sat(dot(normalize(N.xy + 1e-5), skySun));   // light through the thin sunward edges
  return vec4(c, smoothstep(0., .14, h));
}
// torn scraps of stratus between the formation and the deck
vec4 sky_wisps(vec2 a) {
  float n = fbm3(a * vec2(.2, .3) + vec2(3.1, 7.7));
  return vec4(vec3(.86, .74, .68), smoothstep(.6, .82, n) * .42);
}

// four contrails behind a plane (plane space): born a little aft, spreading and merging, bending when the box turns
float sky_trail(vec2 lp, float bend) {
  float u = .1 - lp.y;
  if (u < 0. || u > 14.) return 0.;
  float x = lp.x + bend * u * u, w = .02 + .03 * u, s = 0.;
  for (int k = 0; k < 4; k++) { float d = (x - ENGINE_FRONT[k].x * (1. + .02 * u)) / w; s += exp(-d * d); }
  return sat(s * .8) * smoothstep(.25, 1.4, u) * exp(-u * .2);
}

// a B-17 at plane-space point lp (roll already applied to lp); px = one pixel in plane units; hd = heading
vec4 sky_b17(vec2 lp, float px, float roll, float hd) {
  float fu = pl_fus(lp), na = pl_nac(lp), wi = min(pl_wing(lp), pl_tail(lp)), d = min(min(fu, na), wi);
  float prop = stroke(planeProps(lp), .004, px * 1.5) * .3 * (.65 + .35 * sin(skyT * 47. + lp.x * 61.));
  float a = fill(d, px * 1.5);
  if (a <= 0.) return vec4(.75, .72, .66, prop);
  const float e = .004;
  float ax = abs(lp.x), under = step(cos(roll), 0.);
  vec3 N;
  if (fu < 0.) {          // round fuselage
    vec2 g = normalize(vec2(pl_fus(lp + vec2(e, 0.)) - fu, pl_fus(lp + vec2(0., e)) - fu) + 1e-6);
    float r = sat(1. + fu / .068); N = vec3(g * r, sqrt(1. - r * r));
  } else if (na < 0.) {   // round nacelles
    vec2 g = normalize(vec2(pl_nac(lp + vec2(e, 0.)) - na, pl_nac(lp + vec2(0., e)) - na) + 1e-6);
    float r = sat(1. + na / .04); N = vec3(g * r, sqrt(1. - r * r));
  } else {                // wings and tail: an airfoil crest near the front, softened edges
    float le = .356 - .2586 * ax, te = -.03 - .01 * ax;
    N = lp.y < -.3 ? vec3(0., 0., 1.) : normalize(vec3(0., (sat((lp.y - te) / (le - te)) - .72) * .5, 1.));
    vec2 g = normalize(vec2(min(pl_wing(lp + vec2(e, 0.)), pl_tail(lp + vec2(e, 0.))) - wi, min(pl_wing(lp + vec2(0., e)), pl_tail(lp + vec2(0., e))) - wi) + 1e-6);
    N = normalize(N + vec3(g * sat(1. + wi / .012) * 1.2, 0.));
  }
  // paint: olive drab above, neutral grey below, sun-faded
  vec3 alb = under > .5 ? vec3(.44, .45, .45) : vec3(.215, .225, .135);
  alb *= .86 + .28 * vnoise(lp * vec2(9., 18.));
  float glass = 0.;
  if (under < .5) {
    float le = .356 - .2586 * ax - lp.y, tle = -.389 - .372 * ax - lp.y;
    float boot = step(wi, 0.) * step(0., min(fu, na)) * (step(0., le) * step(le, .03) + step(lp.y, -.35) * step(0., tle) * step(tle, .022));
    alb = mix(alb, vec3(.05), boot);                                    // de-icer boots
    vec2 sp = lp - vec2(-.66, .078);
    alb = mix(alb, vec3(.07, .09, .2), fill(length(sp) - .052, px));   // the star on the left wing
    alb = mix(alb, vec3(.78, .77, .72), fill(sdStar5(sp, .048, .45), px));
    if (na < 0.) alb = mix(alb, vec3(.06), smoothstep(-.035, -.02, -(ENGINE_FRONT[ax > .37 ? 3 : 2].y - lp.y)));   // cowl rings
    if (fu < 0.) {
      glass = max(smoothstep(.585, .6, lp.y), step(lp.y, -.615));                          // nose and tail glazing
      glass = max(glass, fill(sdBox(vec2(ax, lp.y - .468) - vec2(.022, 0.), vec2(.017, .02)), px));   // cockpit
      glass = max(glass, fill(length(lp - vec2(0., .405)) - .026, px));                    // top turret
    }
  }
  // wing-root and nacelle shading: the skin darkens where the parts meet
  if (fu > 0.) alb *= mix(.55, 1., smoothstep(0., .07, fu)) * (na > 0. ? mix(.7, 1., smoothstep(0., .03, na)) : 1.);
  float cr = cos(roll), sr = sin(roll);
  vec3 Nf = under > .5 ? vec3(N.xy, -N.z) : N;
  N = vec3(Nf.x * cr + Nf.z * sr, Nf.y, -Nf.x * sr + Nf.z * cr);
  N.xy = rot(hd) * N.xy;
  float dif = max(dot(N, skyL), 0.);
  vec3 sunC = vec3(1.3, .98, .72) * (1. + skyFlare * .6);
  vec3 col = alb * (vec3(.30, .33, .44) * (.55 + .45 * N.z) + sunC * dif);
  float sp = pow(max(dot(N, normalize(skyL + vec3(0., 0., 1.))), 0.), 28.);
  col += sunC * sp * .12;
  col = mix(col, vec3(.36, .4, .5) * (.45 + .6 * dif) + sunC * sp * .8, glass * .85);
  return vec4(col, max(a, prop));
}

// ---- combat ----
// a flak burst: B = (x, y, radius, age + 10 * seed id). Dirty black-brown smoke, lit on the sun side, flash at birth
vec4 sky_burst(vec2 p, vec4 B) {
  vec2 d = p - B.xy;
  float r = B.z, l2 = dot(d, d);
  if (l2 > r * r * 2.6) return vec4(0.);
  float a = mod(B.w, 10.), sd = floor(B.w / 10.) * .0137;
  vec2 nd = d / r;
  float l = sqrt(l2) / r;
  float n = fbm3(nd * 1.7 + sd * 91.7 + vec2(0., a * .35));
  float body = smoothstep(1., .5, l + (n - .5) * 1.1);
  float dens = body * smoothstep(0., .05, a) * (1. - smoothstep(2.6, 4.8, a)) * mix(.97, .6, sat(a / 4.));
  vec3 col = mix(vec3(.045, .036, .03), vec3(.2, .185, .175), sat(a / 3.5)) * (.75 + .5 * n);
  col += vec3(.42, .27, .16) * sat(dot(nd, skySun)) * smoothstep(.2, 1., l) * .55;     // the sun catches its edge
  float fl = exp(-a * 11.) * exp(-l * l * 5.);
  col += vec3(4., 2.3, .9) * fl + vec3(1.2, .45, .1) * exp(-a * 4.) * exp(-l * l * 2.) * body;
  return vec4(col, max(dens, fl * .8));
}

// a smoke trail: points row 4, base .. base + n, each (x, y, width, density); box = bounds
float sky_smoke(vec2 p, int base, int n, vec4 box) {
  if (n < 2 || p.x < box.x || p.y < box.y || p.x > box.z || p.y > box.w) return 0.;
  float den = 0.;
  vec4 a = row(4, base);
  for (int k = 1; k < 32; k++) {
    if (k >= n) break;
    vec4 b = row(4, base + k);
    vec2 pa = p - a.xy, ba = b.xy - a.xy;
    float h = sat(dot(pa, ba) / max(dot(ba, ba), 1e-6)), w = mix(a.z, b.z, h), d = length(pa - ba * h) / w;
    den = max(den, mix(a.w, b.w, h) * exp(-d * d * 1.3));
    a = b;
  }
  return den;
}

// Fw 190 in plan view: round radial cowling, straight tapered wings, small tail. Span 1, nose +y.
float sky_fw(vec2 p) {
  vec2 q = vec2(abs(p.x), p.y);
  float fus = min(sdUCap(p, vec2(0., .28), .068, vec2(0., -.5), .018), length(p - vec2(0., .31)) - .082);
  float wing = sdPoly4(q, vec2(0., .13), vec2(.5, .025), vec2(.5, -.055), vec2(0., -.12)) - .012;
  float tail = sdPoly4(q, vec2(0., -.38), vec2(.17, -.43), vec2(.17, -.48), vec2(0., -.5)) - .008;
  return min(fus, min(wing, tail));
}
vec4 sky_fighter(vec2 lp, float px, float roll, float hd) {
  float d = sky_fw(lp);
  float prop = stroke(sdSeg(lp, vec2(-.17, .4), vec2(.17, .4)), .006, px * 1.5) * .35;
  float a = fill(d, px * 1.5);
  if (a <= 0.) return vec4(.7, .7, .66, prop);
  float under = step(cos(roll), 0.), fu = min(sdUCap(lp, vec2(0., .28), .068, vec2(0., -.5), .018), length(lp - vec2(0., .31)) - .082);
  vec2 g = normalize(vec2(sky_fw(lp + vec2(.006, 0.)) - d, sky_fw(lp + vec2(0., .006)) - d) + 1e-6);
  float r = fu < 0. ? sat(1. + fu / .07) : sat(1. + d / .015) * .6;
  vec3 N = vec3(g * r, sqrt(1. - r * r));
  vec3 alb = under > .5 ? vec3(.6, .66, .7) : vec3(.34, .36, .35) * (.8 + .4 * vnoise(lp * 16.));   // RLM 74/75 mottle, RLM 76 below
  if (under < .5) {
    alb = mix(alb, vec3(.05, .055, .05), fill(length(lp - vec2(0., .31)) - .082, px));              // black cowling
    alb = mix(alb, vec3(.85, .68, .1), step(abs(lp.y + .3), .035) * step(fu, 0.));                  // yellow band
    vec2 bk = vec2(abs(lp.x) - .33, lp.y + .02);
    float cross = min(sdBox(bk, vec2(.055, .014)), sdBox(bk, vec2(.014, .055)));
    alb = mix(alb, vec3(.85), fill(cross - .012, px));
    alb = mix(alb, vec3(.03), fill(cross, px));                                                      // Balkenkreuz
    alb = mix(alb, vec3(.3, .36, .42), fill(sdUCap(lp, vec2(0., .14), .028, vec2(0., .02), .022), px));   // canopy
  }
  float cr = cos(roll), sr = sin(roll);
  vec3 Nf = under > .5 ? vec3(N.xy, -N.z) : N;
  N = vec3(Nf.x * cr + Nf.z * sr, Nf.y, -Nf.x * sr + Nf.z * cr);
  N.xy = rot(hd) * N.xy;
  float dif = max(dot(N, skyL), 0.);
  vec3 col = alb * (vec3(.3, .33, .44) * (.55 + .45 * N.z) + vec3(1.3, .98, .72) * dif);
  col += vec3(1.3, 1., .75) * pow(max(dot(N, normalize(skyL + vec3(0., 0., 1.))), 0.), 30.) * .3;
  return vec4(col, max(a, prop));
}
// tracer streams ahead of a fighter: lw = fighter-local world units (nose +y), guns firing from t0 to t1
float sky_tracers(vec2 lw, float c, float t0, float t1, float sd) {
  if (lw.y < 0. || lw.y > 5.5 || abs(lw.x) > .3) return 0.;
  float s = 0.;
  for (int g = 0; g < 2; g++) {
    float gx = g == 0 ? -.1 : .1, fired = c - lw.y / 20.;
    if (fired < t0 || fired > t1) continue;
    float ph = fract(fired * 9. + float(g) * .43 + sd);
    s += smoothstep(0., .02, ph) * smoothstep(.17, .1, ph) * fill(abs(lw.x - gx * (1. - lw.y / 3.6)) - .005, gPix * 1.5);
  }
  return s;
}

// fire streaming aft from plane-space point f
vec4 sky_fire(vec2 lp, vec2 f, float amt) {
  vec2 d = lp - f;
  float along = -d.y;
  if (along < -.1 || along > .8 || abs(d.x) > .3) return vec4(0.);
  float fl = vnoise(vec2(d.x * 16., along * 8. - skyT * 16.) + f * 40.);
  float w = .025 + .1 * sat(along / .6), len = (.42 + .34 * fl) * amt;
  float shape = exp(-d.x * d.x / (w * w)) * smoothstep(-.05, .02, along) * (1. - smoothstep(len * .4, len, along)) * (.55 + .7 * fl);
  float core = exp(-d.x * d.x / (w * w * .12)) * (1. - smoothstep(0., len * .4, along)) * smoothstep(-.03, .01, along);
  vec3 col = mix(vec3(1.1, .25, .03), vec3(1.8, 1., .35), sat(shape)) + vec3(2.2, 1.8, 1.2) * core;
  return vec4(col * 1.3, sat(shape * 1.4 + core) * amt);
}

// a parachute seen from above: C = (x, y, radius, alpha)
vec4 sky_chute(vec2 p, vec4 C) {
  vec2 d = p - C.xy;
  float l = length(d), r = C.z;
  if (l > r + gPix * 3.) return vec4(0.);
  float dome = sqrt(sat(1. - l * l / (r * r)));
  vec3 N = normalize(vec3(d / r, dome + .15));
  float dif = sat(dot(N, skyL) * .75 + .35);
  vec3 col = mix(vec3(.5, .52, .64), vec3(1.05, .97, .88), dif) * (.9 + .1 * cos(atan(d.y, d.x) * 12.));
  col = mix(col, vec3(.25), fill(l - r * .12, gPix) * step(.06, r));
  return vec4(col, fill(l - r, gPix * 1.5));
}

// the spark of a hit: S = (x, y, size, age)
vec3 sky_spark(vec2 p, vec4 S) {
  float a = S.w, r = S.z;
  if (a < 0. || a > .6) return vec3(0.);
  vec2 d = p - S.xy;
  float l = length(d);
  if (l > r * 2.5) return vec3(0.);
  float ang = atan(d.y, d.x), k = floor((ang / TAU + .5) * 9.), sd = S.x * 3.1 + S.y * 7.7;
  float sa = (k + .5 + (hash11(k + sd) - .5) * .7) / 9. * TAU - PI;
  vec2 dir = vec2(cos(sa), sin(sa));
  float along = dot(d, dir), across = abs(dot(d, vec2(-dir.y, dir.x)));
  float len = r * (.4 + 2.4 * a) * (.5 + .7 * hash11(k * 3.1 + sd));
  float streak = step(0., along) * smoothstep(len, len * .5, along) * fill(across - .003, gPix * 1.5) * exp(-a * 5.);
  return vec3(1.7, 1.25, .75) * (exp(-l * l / (r * r * .05)) * exp(-a * 10.) * 7. + streak * 3.);
}

void sky_fighters(vec2 p, inout vec3 col, bool below, int nF, float c) {
  for (int i = 0; i < 4; i++) {
    if (i >= nF) break;
    vec4 A = row(5, 32 + i), B = row(5, 40 + i);
    if ((B.w > 0.) != below) continue;
    vec2 lw = rot(-A.z) * (p - A.xy);
    float tr = sky_tracers(lw / A.w * .55, c, B.z - .45, B.z, float(i) * .37);
    col += vec3(2.4, 2., 1.1) * tr * B.y;
    vec2 lp = lw / A.w;
    if (dot(lp, lp) > .5) continue;
    float cr = cos(B.x);
    vec2 rp = vec2(lp.x / (sign(cr + 1e-5) * max(abs(cr), .1)), lp.y);
    vec4 f = sky_fighter(rp, gPix / A.w / max(abs(cr), .1), B.x, A.z);
    col = mix(col, f.rgb, f.a * B.y);
  }
}

vec3 sceneSky(vec2 p, vec2 q, vec2 suv) {
  gPix = uCam.z / uRes.y;
  skyAir = uP[0].xy; skyFlare = uP[0].z; skyT = uP[0].w; skySun = uP[4].xy;
  skyL = normalize(vec3(skySun * .95, .31));
  int nP = int(uP[1].x), nS = int(uP[3].x), yi = int(uP[2].z);
  float bend = uP[3].w;

  // the ground, far below, through the gaps in the deck
  vec4 deck = sky_deck(skyAir + sky_at(p, SKY_G2));
  vec3 col = vec3(0.);
  if (deck.a < .99) col = mix(sky_ground(skyAir + sky_at(p, SKY_G3)), vec3(.24, .3, .42), .55) * mix(1., .45, skyGap);
  // the planes' shadows (and their contrails') on the deck
  float sh = 0.;
  if (deck.a > .01) for (int i = 0; i < 48; i++) {
    if (i >= nS) break;
    vec4 A = row(4, 64 + i);
    vec2 lp = rot(-A.z) * (p - A.xy) / A.w;
    if (lp.y < .2 && lp.y > -16. && abs(lp.x) < 2.6) sh = max(sh, .3 * sky_trail(lp, bend));
    if (dot(lp, lp) < 1.35) sh = max(sh, smoothstep(.1, -.18, planeD(lp)) * .6);   // soft, and zero before planeD's bounding circle
  }
  deck.rgb *= mix(vec3(1.), vec3(.5, .53, .72), sh);
  col = mix(col, deck.rgb, deck.a);
  vec4 wisp = sky_wisps(skyAir * .9 + sky_at(p, SKY_G1));
  col = mix(col, wisp.rgb, wisp.a);

  float c = uP[2].w;
  int nBb = int(uP[1].y), nBa = int(uP[1].z), nF = int(uP[1].w), nC = int(uP[2].x), nH = int(uP[2].y), nK = int(uP[4].w);
  // the burning planes' smoke, left hanging in the air
  float sm = max(sky_smoke(p, 0, int(uP[3].y), uP[6]), sky_smoke(p, 32, int(uP[3].z), uP[7]));
  if (sm > .003) {
    float n = fbm3((p + skyAir) * 1.7);
    col = mix(col, mix(vec3(.03, .027, .025), vec3(.17, .15, .14), n) + vec3(.22, .13, .06) * sat(n - .55), sat(sm * (.3 + 1.2 * n) * 1.4));
  }
  for (int i = 0; i < 48; i++) { if (i >= nBb) break; vec4 b = sky_burst(p, row(3, i)); col = mix(col, b.rgb, b.a); }
  for (int i = 0; i < 16; i++) { if (i >= nC) break; vec4 C = row(5, i); vec4 ch = sky_chute(p, C); col = mix(col, ch.rgb, ch.a * C.w); }
  if (nF > 0) sky_fighters(p, col, true, nF, c);

  // contrails, then the planes (with their fires, and the viewer's holes)
  float trail = 0., pa = 0.; vec3 pc = vec3(0.), glow = vec3(0.); vec4 fire = vec4(0.);
  for (int i = 0; i < 32; i++) {
    if (i >= nP) break;
    vec4 A = row(0, i), B = row(1, i);
    vec2 lp = rot(-A.z) * (p - A.xy) / A.w;
    if (B.z > 0. && lp.y < .2 && lp.y > -16. && abs(lp.x) < 2.6) trail = max(trail, B.z * sky_trail(lp, bend));
    if (dot(lp, lp) > (B.w > 0. ? 3.2 : 1.5)) continue;
    float cr = cos(B.x), px = gPix / A.w;
    vec2 rp = vec2(lp.x / (sign(cr + 1e-5) * max(abs(cr), .08)), lp.y);
    vec4 pl = sky_b17(rp, px / max(abs(cr), .08), B.x, A.z);
    vec4 C = row(2, i);
    if (i == yi) for (int k = 0; k < 12; k++) {
      if (k >= nH) break;
      vec4 hk = row(5, 64 + k);
      if (c < hk.z) continue;
      vec2 hp = rp - hk.xy;
      float l = length(hp), ang = atan(hp.y, hp.x), on = step(planeD(rp), 0.);
      float r = hk.w * (1. + .3 * sin(ang * 5. + hk.x * 40.) + .15 * sin(ang * 9. + hk.y * 30.));
      pl.rgb *= 1. - .6 * on * smoothstep(r * 3.4, r, l);                                    // scorched paint
      pl.rgb = mix(pl.rgb, vec3(.72, .7, .64), on * stroke(l - r * 1.2, r * .2, px * 1.5) * .75);   // torn bright metal
      pl.rgb = mix(pl.rgb, mix(vec3(.012), vec3(2.2, .8, .25), exp(-(c - hk.z) * 2.2)), on * fill(l - r, px * 1.2));
    }
    if (C.z > 0.) {   // the viewer's plane: a gold outline that breathes
      float d = planeD(rp);
      pl.rgb = mix(pl.rgb, vec3(1., .8, .42) * 1.6, C.z * stroke(d, .006, px * 1.5));
      pl.a = max(pl.a, C.z * .5 * exp(-max(d, 0.) / .035) * step(0., d));
      if (d > 0.) pl.rgb = mix(vec3(1., .78, .38) * 1.3, pl.rgb, fill(d, px * 1.5));
    }
    // falling planes sink into the haze and behind the scraps of cloud
    pl.rgb = mix(pl.rgb, deck.rgb, smoothstep(.2, 1., C.w / SKY_G2) * .75);
    pl.a *= B.y * (1. - wisp.a * smoothstep(SKY_G1 - .4, SKY_G1 + .4, C.w));
    if (pl.a > 0.) { pc = mix(pc, pl.rgb, pl.a); pa = pa + (1. - pa) * pl.a; }
    if (B.w > 0.) {
      vec4 f = sky_fire(rp, C.xy, B.w);
      f.a *= B.y;
      fire = vec4(mix(fire.rgb, f.rgb, f.a), max(fire.a, f.a));
      glow += vec3(1., .42, .12) * B.w * B.y * .45 * exp(-dot(rp - C.xy, rp - C.xy) / .03);
    }
  }
  if (trail > 0.) col = mix(col, vec3(1., .93, .86), sat(trail * (.45 + .8 * vnoise((p + skyAir) * 2.6))) * .72);
  col = mix(col, pc / max(pa, 1e-4), pa);
  col = mix(col, fire.rgb, fire.a) + glow;

  for (int i = 64; i < 112; i++) { if (i - 64 >= nBa) break; vec4 b = sky_burst(p, row(3, i)); col = mix(col, b.rgb, b.a); }
  if (nF > 0) sky_fighters(p, col, false, nF, c);
  for (int i = 0; i < 16; i++) { if (i >= nK) break; col += sky_spark(p, row(6, i)); }
  // the flash of the nearest burst or hit lights everything around it
  vec4 fl = uP[5];
  if (fl.w > 0.) { vec2 d = p - fl.xy; col += vec3(1., .58, .28) * fl.w * exp(-dot(d, d) / (fl.z * fl.z)) * (.12 + .45 * pa); }

  // the approach: thin cirrus the camera sinks through
  if (uP[4].z > 0.) col = mix(col, vec3(.92, .84, .8), smoothstep(.45, .8, fbm3(sky_at(p, -4.) * .35 + skyAir * .3)) * uP[4].z * .7);

  // grade: warm on the sun's side of the frame, cool on the other; the turn for home flares gold
  vec2 sunS = rot(-uCam.w) * skySun;
  float sw = sat(.5 + .45 * dot(q, sunS));
  col *= mix(vec3(.82, .86, 1.), vec3(1.08, 1., .9), sw);
  col += skyFlare * vec3(1., .7, .35) * .22 * sw * sw;
  return col;
}
`;

  // ---------------- choreography (all deterministic in t) ----------------
  const PI = Math.PI;
  const cl = x => Math.max(0, Math.min(1, x)), mix = (a, b, k) => a + (b - a) * k;
  const ez = x => (x = cl(x), x * x * (3 - 2 * x)), ez5 = x => (x = cl(x), x * x * x * (x * (x * 6 - 15) + 10));
  const hh = (a, b = 0) => {   // integer hash -> 0..1
    let x = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2f); x ^= x >>> 16; return (x >>> 0) / 4294967296;
  };

  const V = 1.1;                                          // how fast the air streams past the formation (units/s)
  const G2 = 6;                                           // depth of the cloud deck (see sky_at)
  const SQ = [[0, 0], [-2.8, -1.7], [2.8, -1.7], [-1.4, -4.2], [1.4, -4.2], [-4.2, -4.2], [4.2, -4.2]];
  // three squadrons of seven: lead, high (right, a little closer to us), low (left, a little further)
  const SLOTS = [[0, 5, 0], [7.2, -1.2, -.35], [-7.2, -2.6, .35]].flatMap(([ox, oy, g]) => SQ.map(([x, y]) => [ox + x, oy + y, g]));
  const YOU = 4, OTHER = 5, PIV = [0, -.9];                // your plane: lead squadron, rear right; the other: its left
  const SUN = [Math.cos(-.22), Math.sin(-.22)];            // low dawn sun, east by a little south
  const SHADOW = [-1.6, .36];                              // where a plane's shadow falls on the deck (world units)
  const TURN0 = 22, TURN1 = 30, TURN = 150 * PI / 180, END = 32, DROP = 19;
  const O_HIT = 9, O_DROP = 10.2, O_CHUTES = [10.9, 11.5, 12.2, 12.9, 13.7], Y_CHUTES = [20.6, 21.2, 21.9, 22.7, 23.6];
  const O_SPARKS = [[8.6, -.62, .12], [8.72, -.4, .2], [8.83, -.25, .39], [8.95, -.8, .05]];
  // Fw 190s: each passes (x, y) at combat time cp, nose down-screen turned by ang, guns firing until tf
  const FWS = [{ cp: 7.0, x: 3.6, y: 2.4, ang: .32, tf: 6.85 }, { cp: 7.6, x: -1.9, y: 1.6, ang: -.28, tf: 7.45 },
    { cp: 9.05, x: -3.75, y: 1.1, ang: .1, tf: 8.95 }, { cp: 11.3, x: 2.7, y: .45, ang: -.2, tf: 11.1 }];
  const fronts = () => (H.model ? H.model.engineFronts() : [[-.49, .324], [-.245, .387], [.245, .387], [.49, .324]]);

  const turnA = c => TURN * ez5((c - TURN0) / (TURN1 - TURN0));
  const turnW = c => { const x = (c - TURN0) / (TURN1 - TURN0); return x <= 0 || x >= 1 ? 0 : TURN * 30 * x * x * (1 - x) * (1 - x) / (TURN1 - TURN0); };
  // how far the formation has moved through the air by scene time t (the turn integrated once, as a table)
  const TT = (() => {
    const n = 800, a = [[0, 0]]; let x = 0, y = 0;
    for (let i = 1; i <= n; i++) { const th = turnA(TURN0 + (i - .5) / n * 8); x -= Math.sin(th) * 8 / n; y += Math.cos(th) * 8 / n; a.push([x, y]); }
    return a;
  })();
  function air(t, claim) {
    const c = claim == null ? -1e9 : t - claim;
    if (c <= TURN0) return [0, V * t];
    const f = Math.min(c - TURN0, 8) / 8 * 800, i = Math.min(799, Math.floor(f)), k = f - i;
    let x = V * mix(TT[i][0], TT[i + 1][0], k), y = V * (claim + TURN0) + V * mix(TT[i][1], TT[i + 1][1], k);
    if (c > TURN1) { x -= Math.sin(TURN) * V * (c - TURN1); y += Math.cos(TURN) * V * (c - TURN1); }
    return [x, y];
  }
  // a stricken bomber slows, spins toward its dead side (sg = +1 left) and falls: its path through the air, as tables
  const spin = s => .12 * s * s + .02 * s * s * s;
  const FALL = [1, -1].map(sg => {
    const n = 600, a = [[0, 0]]; let x = 0, y = 0;
    for (let i = 1; i <= n; i++) { const s = (i - .5) / n * 12, v = V * Math.max(.1, 1 - .45 * s), h = sg * spin(s); x -= Math.sin(h) * v * 12 / n; y += Math.cos(h) * v * 12 / n; a.push([x, y]); }
    return a;
  });
  const fallF = (sg, s) => { const T = FALL[sg > 0 ? 0 : 1], f = cl(s / 12) * 600, i = Math.min(599, Math.floor(f)), k = f - i; return [mix(T[i][0], T[i + 1][0], k), mix(T[i][1], T[i + 1][1], k)]; };

  function slot(i, t, th) {   // slot i at scene time t, with the box turned by th about its pivot
    const [sx, sy, g] = SLOTS[i], ph = i * 2.399;
    const x = sx + .07 * Math.sin(.31 * t + ph) + .03 * Math.sin(.83 * t + 2 * ph) - PIV[0];
    const y = sy + .09 * Math.sin(.23 * t + 3 * ph) + .03 * Math.sin(.71 * t + ph) - PIV[1];
    const c = Math.cos(th), s = Math.sin(th);
    return { x: PIV[0] + c * x - s * y, y: PIV[1] + s * x + c * y, h: th + .012 * Math.sin(.4 * t + ph), g, roll: .025 * Math.sin(.5 * t + ph) };
  }
  // bomber i at combat time c: in its slot, or (from cd) falling out of the box. gT = seconds to reach the deck
  function bomber(i, c, claim, cd, sg, gT) {
    if (cd == null || c <= cd) return slot(i, claim + c, turnA(c));
    const s0 = slot(i, claim + cd, turnA(cd)), s = c - cd, F = fallF(sg, s), D0 = air(claim + cd, claim), D1 = air(claim + c, claim);
    return { x: s0.x + F[0] - (D1[0] - D0[0]), y: s0.y + F[1] - (D1[1] - D0[1]), h: s0.h + sg * spin(s),
      g: G2 * Math.min(1.2, (s / gT) ** 2), roll: -sg * .22 * s * s, fall: s };
  }

  // the approach and the wait: from very high over the box, down onto the viewer's plane, then breathing
  function calmCam(t) {
    const k = ez5(t / 10), b = SLOTS[YOU], d = cl((t - 8) / 4);
    return [mix(0, b[0], k) + d * .06 * Math.sin(.21 * t), mix(.6, b[1], k) + d * .05 * Math.sin(.17 * t + 1),
      9 * Math.pow(2.6 / 9, k) * (1 + d * .025 * Math.sin(.33 * t)), -.07 * (1 - k) + d * .01 * Math.sin(.13 * t)];
  }

  // everything that depends on the viewer's sortie: when each hit lands, where the fire starts, the flak
  let SC = null;
  function schedule(your) {
    const key = your.id + ":" + your.hits.length + ":" + your.fatal;
    if (SC && SC.key === key) return SC;
    const n = your.hits.length, f = your.lost && your.fatal >= 0 ? your.fatal : -1, T = [];
    if (f < 0) for (let k = 0; k < n; k++) T.push(14.2 + 6.6 * (k + .5 + .5 * (hh(your.id, k) - .5)) / n);
    else {
      const tf = f === 0 ? 15.2 : Math.min(18.2, 15.4 + 2.8 * f / Math.max(1, n - 1)), m = n - f - 1;
      for (let k = 0; k < f; k++) T.push(14.1 + (tf - .5 - 14.1) * (k + .5) / f);
      T.push(tf);
      for (let j = 0; j < m; j++) T.push(tf + .6 + (21 - tf - .6) * (j + .5) / m);
    }
    let fire = null, sg = 1;
    if (f >= 0) {
      const h = your.hits[f], d = e => Math.hypot(e[0] - h.x, e[1] - h.y);
      fire = h.z === 0 ? fronts().reduce((a, e) => d(e) < d(a) ? e : a) : [h.x, h.y];
      sg = fire[0] < 0 ? 1 : -1;
    }
    const sc = SC = { key, T, f, lost: f >= 0, tf: f >= 0 ? T[f] : null, fire, sg, hits: your.hits, id: your.id };
    // flak: a seeded stream of bursts, thickening, then thinning out in the turn
    const rate = c => c < 6 ? .8 + 5.2 * ez(c / 6) : c < 14 ? 3 : c < 22 ? 5 : c < 30 ? mix(5, .3, ez((c - 22) / 7)) : .25;
    const B = sc.bursts = [];
    for (let s = 0; s < 330; s++) {
      const cb = s * .1 + hh(s, 1) * .1;
      if (hh(s, 2) > rate(cb) * .1) continue;
      const near = hh(s, 3) < .5, th = turnA(cb);
      let x = near ? SLOTS[YOU][0] + (hh(s, 4) - .5) * 9 : (hh(s, 4) - .5) * 28, y = near ? SLOTS[YOU][1] - 1 + hh(s, 5) * 8 : -8 + hh(s, 5) * 22;
      let g = -.9 + hh(s, 6) * 2.6;
      if (Math.hypot(x - SLOTS[YOU][0], y - SLOTS[YOU][1]) < 1.8 && g < 0) g = -g;    // never right over your plane
      x -= PIV[0]; y -= PIV[1];
      B.push({ cb, x: PIV[0] + Math.cos(th) * x - Math.sin(th) * y, y: PIV[1] + Math.sin(th) * x + Math.cos(th) * y, g, r: .42 + .3 * hh(s, 7), id: s, kick: .25 });
    }
    // the bursts that hit you, just beside the plane (placed when the combat clock is known)
    T.forEach((tk, k) => B.push({ cb: tk - .04, you: k, g: -.12, r: .5, id: 400 + k, kick: 1 }));
    B.sort((a, b) => a.cb - b.cb);
    Object.assign(sky.beats, { yourHits: T.map(x => Math.round(x * 100) / 100), fatal: sc.tf == null ? null : Math.round(sc.tf * 100) / 100, drop: sc.lost ? DROP : null });
    return sc;
  }

  let labYour = null;
  function resolve(ctx) {
    if (!ctx.lab) return { your: ctx.your || { id: -1, hits: [], lost: false, fatal: -1 }, claim: ctx.claimAt ?? null };
    if (!labYour) {
      const lost = new URLSearchParams(location.search).get("your") === "lost";
      const pool = ctx.sim.sorties.filter(s => s.lost === lost);
      labYour = pool.find(s => s.hits.length >= 3) || pool[0];
    }
    return { your: labYour, claim: 10 };
  }

  const sky = H.scenes.sky = {
    id: 1, fn: "sceneSky", glsl,
    beats: { flak: 0, fighters: 6, otherHit: 9, yourHits: [], fatal: null, drop: null, turn: TURN0, end: END },
    state: { your: { x: SLOTS[YOU][0], y: SLOTS[YOU][1], r: 1.05 } },
    update(t, L, E, ctx) {
      const { your, claim } = resolve(ctx), sc = schedule(your);
      const c = claim == null ? -1e9 : Math.min(t - claim, END + 4), cc = claim == null ? 0 : claim;
      const calm = c < 0;
      // the three bombers that matter, in the formation's frame (true positions, before perspective)
      const yourAt = x => {
        const b = bomber(YOU, x, cc, sc.lost ? DROP : null, sc.sg, 7);
        for (const T of sc.T) {   // it shudders at every hit
          const a = x - T;
          if (a >= 0 && a < 1.5) { const e = Math.exp(-a * 5); b.x += e * .05 * Math.sin(a * 61 + T); b.y += e * .04 * Math.sin(a * 47 + 2 * T); b.h += e * .035 * Math.sin(a * 53 + 3 * T); }
        }
        return b;
      };
      const otherAt = x => bomber(OTHER, x, cc, O_DROP, 1, 6.5);
      const Y = calm ? slot(YOU, t, 0) : yourAt(c), O = calm ? slot(OTHER, t, 0) : otherAt(c);

      // ---- camera ----
      let cam = calmCam(t);
      if (!calm) {
        const bx = mix(Y.x, PIV[0], .5), by = mix(Y.y, PIV[1], .5);
        const K = [[0, cam], [5.4, [Y.x, Y.y + .9, 4.2, -.02]], [8.1, [mix(Y.x, O.x, .5), Y.y + 1.1, 5.7, -.05]],
          [12.3, [mix(Y.x, O.x, .6), mix(Y.y, O.y, .45), 6.3, -.03]], [14, [Y.x, Y.y + .15, 3, .015]], [19, [Y.x, Y.y, 2.75, 0]]];
        if (sc.lost) K.push([21.5, [Y.x, Y.y, 3.5, .06]], [24.5, [PIV[0], PIV[1] + 1, 6.6, 0]], [30, [PIV[0], PIV[1] + 1, 6, 0]], [END, [PIV[0], PIV[1] + 1, 5.8, 0]]);
        else K.push([21.5, [Y.x, Y.y + .3, 3.3, 0]], [25.5, [bx, by, 6.4, 0]], [30, [bx, by, 6, 0]], [END, [bx, by, 5.8, 0]]);
        let i = 0;
        while (i < K.length - 2 && c >= K[i + 1][0]) i++;
        const [c0, a] = K[i], [c1, b] = K[i + 1], e = ez5((c - c0) / (c1 - c0));
        cam = [mix(a[0], b[0], e), mix(a[1], b[1], e), Math.exp(mix(Math.log(a[2]), Math.log(b[2]), e)), mix(a[3], b[3], e) + .88 * turnA(c)];
      }
      const zoom = cam[2], aspect = E.w / Math.max(1, E.h), k2 = 1 + G2 / zoom;
      const D = air(t, claim), th = calm ? 0 : turnA(c);
      const proj = (x, y, g) => { const s = 1 / (1 + g / zoom); return [cam[0] + (x - cam[0]) * s, cam[1] + (y - cam[1]) * s, s]; };

      // ---- flak: position, shake, the brightest flash ----
      let shx = 0, shy = 0, shr = 0, flash = [0, 0, 1, 0], nb = 0, na = 0;
      const cvx = cam[0], cvy = cam[1];
      const bursts = [];
      if (!calm) for (const b of sc.bursts) {
        const a = c - b.cb;
        if (a < 0) break;
        if (a > 5) continue;
        let x = b.x, y = b.y;
        if (b.you != null) {   // beside your plane, toward the hit
          const s = yourAt(b.cb), h = sc.hits[b.you], l = Math.hypot(h.x, h.y + .3) || 1, lx = h.x + h.x / l * .8, ly = h.y + (h.y + .3) / l * .8;
          x = s.x + Math.cos(s.h) * lx - Math.sin(s.h) * ly; y = s.y + Math.sin(s.h) * lx + Math.cos(s.h) * ly;
        }
        const D0 = air(cc + b.cb, claim);
        x += -(D[0] - D0[0]) + .05 * a * Math.sin(b.id); y += -(D[1] - D0[1]) + .04 * a;
        const r = b.r * (.3 + .7 * (1 - Math.exp(-a * 4))) + .07 * a;
        if (a < 1.2) {   // near bursts kick the camera
          const near = cl(1 - Math.hypot(x - cvx, y - cvy) / (zoom * .9)) * b.kick * Math.exp(-a * 6);
          shx += near * Math.sin(a * 63 + b.id); shy += near * Math.sin(a * 71 + 2 * b.id); shr += near * Math.sin(a * 57 + 3 * b.id);
          const f = Math.exp(-a * 9) * (b.you != null ? 2.6 : 1.2) * cl(1 - Math.hypot(x - cvx, y - cvy) / zoom);
          if (f > flash[3]) flash = [x, y, r * 4, f];
        }
        bursts.push([x, y, r, a, b.g, b.id]);
      }
      // your hits also shake the camera hard
      if (!calm) for (const T of sc.T) { const a = c - T; if (a >= 0 && a < 1) { const e = Math.exp(-a * 7) * 1.4; shx += e * Math.sin(a * 83 + T); shy += e * Math.sin(a * 77 + T * 2); shr += e * Math.sin(a * 69 + T * 3); } }
      const shk = (ctx.reduced ? .2 : 1) * .016 * zoom;
      cam = [cam[0] + shx * shk, cam[1] + shy * shk, zoom, cam[3] + shr * shk * .15];
      const hv = zoom / 2 + .1, hu = hv * aspect, cr = Math.cos(cam[3]), sr = Math.sin(cam[3]);
      const inView = (x, y, r) => {
        const dx = x - cam[0], dy = y - cam[1];
        return Math.abs(cr * dx + sr * dy) < hu + r && Math.abs(-sr * dx + cr * dy) < hv + r;
      };
      for (const [x0, y0, r0, a, g, id] of bursts) {
        const [x, y, s] = proj(x0, y0, g);
        if (!inView(x, y, r0 * s * 1.7)) continue;
        if (g >= 0 && nb < 48) E.dataRow(3, nb++, x, y, r0 * s, a + 10 * id);
        else if (g < 0 && na < 48) E.dataRow(3, 64 + na++, x, y, r0 * s, a + 10 * id);
      }
      if (flash[3] > 0) { const [x, y, s] = proj(flash[0], flash[1], 0); flash = [x, y, flash[2] * s, flash[3]]; }

      // ---- the bombers ----
      const P = L.P;
      P.fill(0);
      const bank = -.5 * turnW(c) / .61;
      let n = 0, ns = 0, yi = -1;
      for (let i = 0; i < SLOTS.length; i++) {
        const s = i === YOU ? Y : i === OTHER ? O : calm ? slot(i, t, 0) : slot(i, cc + c, th);
        const falling = s.fall != null, depth = s.g;
        const alpha = falling ? 1 - ez((s.g / G2 - .62) / .36) : 1;
        if (alpha <= 0) continue;
        const [x, y, sc2] = proj(s.x, s.y, depth);
        if (i === YOU) sky.state.your = { x, y, r: 1.05 * sc2 };
        if (!falling || s.g < .6) {   // its shadow on the deck, where the camera sees it
          const sx = cam[0] + (s.x + SHADOW[0] - cam[0]) / k2, sy = cam[1] + (s.y + SHADOW[1] - cam[1]) / k2;
          if (inView(sx, sy, 2 / k2 + 4) && ns < 48) E.dataRow(4, 64 + ns++, sx, sy, s.h, 1 / k2);
        }
        const trailK = falling ? 1 - ez(s.fall / .8) : 1;
        const tx = x + Math.sin(s.h) * 14 * sc2 * (trailK > 0 ? 1 : 0), ty = y - Math.cos(s.h) * 14 * sc2 * (trailK > 0 ? 1 : 0);
        let vis = false;
        for (let k = 0; k <= 8 && !vis; k++) vis = inView(mix(x, tx, k / 8), mix(y, ty, k / 8), 2.6 * sc2);
        if (!vis || n >= 32) continue;
        if (i === YOU) yi = n;
        let fire = 0, fl = [0, 0];
        if (i === OTHER && !calm) { fire = ez((c - O_HIT) / .7); fl = fronts()[1]; }
        if (i === YOU && sc.lost && !calm) { fire = ez((c - sc.tf) / .8); fl = sc.fire; }
        const gold = i === YOU ? (calm ? .7 + .3 * Math.sin(t * 2.2) : (.25 + .45 * (1 - cl(c / 2))) * (1 - cl((c - DROP) / 2))) : 0;
        E.dataRow(0, n, x, y, s.h, sc2);
        E.dataRow(1, n, (s.roll || 0) + (falling ? 0 : bank), alpha, trailK, fire);
        E.dataRow(2, n, fl[0], fl[1], gold, depth);
        n++;
      }

      if (!calm) {
        // ---- smoke trails from the burning planes, left in the air where they were made ----
        const trail = (base, at, cf, fire) => {
          if (c < cf) return [0, [0, 0, 0, 0]];
          let m = 0; const box = [1e9, 1e9, -1e9, -1e9];
          for (let k = 0; k < 32; k++) {
            const tau = Math.max(cf, c - k * .26), b = at(tau), age = c - tau, rc = Math.cos(b.roll || 0);
            const fx = fire[0] * rc, fy = fire[1], D0 = air(cc + tau, claim);
            let x = b.x + Math.cos(b.h) * fx - Math.sin(b.h) * fy - (D[0] - D0[0]) + Math.sin(tau * 1.7 + base) * .06 * age;
            let y = b.y + Math.sin(b.h) * fx + Math.cos(b.h) * fy - (D[1] - D0[1]) + .04 * age;
            const g = Math.min(G2, (b.g || 0) + .08 * age), [px, py, s] = proj(x, y, g), w = (.05 + .12 * age) * s;
            const den = ez((tau - cf) / .6 + .3) * Math.exp(-age / 7) * (1 - ez((g / G2 - .6) / .4));
            E.dataRow(4, base + m++, px, py, w, den);
            box[0] = Math.min(box[0], px - 2.2 * w); box[1] = Math.min(box[1], py - 2.2 * w); box[2] = Math.max(box[2], px + 2.2 * w); box[3] = Math.max(box[3], py + 2.2 * w);
            if (tau <= cf) break;
          }
          return [m, box];
        };
        const [mA, boxA] = trail(0, otherAt, O_HIT, fronts()[1]);
        const [mB, boxB] = sc.lost ? trail(32, yourAt, sc.tf, sc.fire) : [0, [0, 0, 0, 0]];
        P[13] = mA; P[14] = mB; P.set(boxA, 24); P.set(boxB, 28);

        // ---- parachutes: the crews bail out ----
        let nc = 0;
        const chutes = (at, times, seed) => times.forEach((r, j) => {
          if (c < r || nc >= 16) return;
          const b = at(r), a = c - r, D0 = air(cc + r, claim);
          const x = b.x + (hh(seed, j) - .5) * .7 - (D[0] - D0[0]) + .05 * a * Math.sin(j * 2.1), y = b.y + (hh(seed + 1, j) - .5) * .7 - (D[1] - D0[1]);
          const g = (b.g || 0) + .6 * Math.min(a, .6) + .22 * Math.max(a - .6, 0), [px, py, s] = proj(x, y, g);
          const al = 1 - ez((g / G2 - .7) / .3);
          if (al > 0 && inView(px, py, .3)) E.dataRow(5, nc++, px, py, (.03 + .15 * ez((a - .5) / .9)) * s, al);
        });
        chutes(otherAt, O_CHUTES, 11);
        if (sc.lost) chutes(yourAt, Y_CHUTES, 23);
        P[8] = nc;

        // ---- fighters and their tracers ----
        let nf = 0;
        FWS.forEach((f, i) => {
          const s = c - f.cp;
          if (s < -2.2 || s > 2.2) return;
          const h = PI + f.ang, sp = 6.5, g = mix(-1.1, 1.5, ez((s + 1.2) / 2.4));
          const [x, y, sc3] = proj(f.x + Math.sin(f.ang) * sp * s, f.y - Math.cos(f.ang) * sp * s, g);
          if (!inView(x, y, 6)) return;
          E.dataRow(5, 32 + nf, x, y, h, .55 * sc3);
          E.dataRow(5, 40 + nf, ez((s - .15) / .9) * 2.6 * Math.sign(f.ang || 1), 1, f.tf, g > 0 ? 1 : 0);
          nf++;
        });
        P[7] = nf;

        // ---- sparks where the shells strike, and your holes ----
        let nk = 0;
        const spark = (b, lx, ly, a, size) => {
          if (a < 0 || a > .6 || nk >= 16) return;
          const rc = Math.cos(b.roll || 0), fx = lx * rc, [x, y, s] = proj(b.x + Math.cos(b.h) * fx - Math.sin(b.h) * ly, b.y + Math.sin(b.h) * fx + Math.cos(b.h) * ly, b.g || 0);
          E.dataRow(6, nk++, x, y, size * s, a);
          if (a < .15 && 2.4 * (1 - a / .15) > flash[3]) flash = [x, y, 1.6 * s, 2.4 * (1 - a / .15)];
        };
        for (const [ts, lx, ly] of O_SPARKS) spark(O, lx, ly, c - ts, .22);
        sc.T.forEach((T, k) => spark(Y, sc.hits[k].x, sc.hits[k].y, c - T, .34));
        sc.T.forEach((T, k) => E.dataRow(5, 64 + k, sc.hits[k].x, sc.hits[k].y, T, .024 + .012 * hh(sc.id, k + 50)));
        P[9] = Math.min(12, sc.T.length); P[19] = nk;
      }

      P[0] = D[0]; P[1] = D[1]; P[2] = calm ? 0 : ez((c - 23) / 4); P[3] = t;
      P[4] = n; P[5] = nb; P[6] = na;
      P[10] = yi; P[11] = calm ? -99 : c;
      P[12] = ns; P[15] = turnW(c) / (2 * V);
      P[16] = SUN[0]; P[17] = SUN[1]; P[18] = claim == null || t < cc ? cl((zoom - 4.6) / 2) : 0;
      P.set(flash, 20);
      L.cam = cam;
    },
  };
})();
