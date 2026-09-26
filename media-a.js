// Media A: ten art media for the subject scene, ids 10-19, sharing one GLSL string.
// Each is  vec3 m_<name>(vec2 p, float d, vec2 n, Hole h)  (see ENGINE.md). Every helper here is prefixed ma_.
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.mediaDefs = H.mediaDefs || [];
  const glsl = /* glsl */ `
// ================= media-a: shared helpers =================
float ma_hpx() { return gPix / (HOLE_R * uPlane.z); }                   // one pixel, in hole radii
float ma_lsc() { return uShape > .5 ? uPlane.z : 1.; }                   // world units per gLocal unit
float ma_lpx() { return gPix / ma_lsc(); }                               // one pixel, in gLocal units
vec2 ma_scr(vec2 p) { return rot(-uCam.w) * (p - uCam.xy) / uCam.z; }    // screen position (y from -.5 to .5)
vec2 ma_nl(vec2 n) { return uShape > .5 ? rot(-uPlane.w) * n : n; }      // the outward normal in gLocal's frame
vec2 ma_arcV(vec2 p) { return p - vec2(0., uArc.x - uArc.y); }           // position from the arc's centre
vec2 ma_arcUV(vec2 p) { vec2 v = ma_arcV(p); return vec2(atan(v.x, v.y) * uArc.y, length(v) - uArc.y); }   // arc length, height
float ma_tent(float x, float hw) { return sat(1. - abs(x) / hw); }
float ma_lod(float period) { return sat(period / gPix * .33 - .5); }     // fades texture finer than ~3 px (period in world units)
float ma_stars(vec2 p, float dens) {
  vec2 i = floor(p * 40.);
  vec3 k = hash32(i);
  vec2 dv = p - (i + .2 + .6 * k.xy) / 40.;
  float b = pow(fract(k.z * 91.7 + k.x * 3.1), 5.), s = gPix * (.6 + 1.1 * b);
  return step(1. - dens, k.z) * (.06 + .9 * b) * (.8 + .2 * sin(uTime * (1. + 2.5 * k.y) + k.x * 50.)) * exp(-dot(dv, dv) / (s * s));
}

// ================= 10 limb: the Earth's limb at dawn, seen from orbit =================
// x: height above the limb in atmosphere thicknesses; hot: sunrise strength 0..1; hz: how much blue haze
vec3 ma_limbAir(float x, float hot, float hz) {
  float w = mix(mix(.42, .03, 1. - hz), 1.05, hot);
  x /= mix(.72, 1.2, hot);
  vec3 c = vec3(1., .17, .03) * 1.45 * w;
  c = mix(c, vec3(1., .36, .07) * w, smoothstep(0., .03, x));
  c = mix(c, vec3(1., .5, .16) * w, smoothstep(.015, .09, x));
  c = mix(c, vec3(.8, .6, .45) * mix(.45, .9, hot) * mix(.7, 1., hz), smoothstep(.07, .17, x));
  c = mix(c, vec3(.42, .56, .64) * mix(.6, 1., hot) * hz, smoothstep(.13, .27, x));
  c = mix(c, vec3(.17, .32, .46) * hz, smoothstep(.25, .5, x));
  c = mix(c, vec3(.045, .09, .17) * hz, smoothstep(.45, .8, x));
  return mix(c, vec3(.009, .013, .026), smoothstep(.7, 1.25, x));
}
// the plane's true distance, without planeD's far-field shortcut (which jumps at radius 1.16 and shows in a morph)
float ma_planeTrue(vec2 p) {
  vec2 q = toPlane(p), o = vec2(uSplit, 0.);
  vec2 a = uSplit > .001 ? q + o : q, b = uSplit > .001 ? q - o : q;
  return min(min(min(pl_fus(a), pl_nac(a)), min(pl_wing(a), pl_tail(a))), min(min(pl_fus(b), pl_nac(b)), min(pl_wing(b), pl_tail(b)))) * uPlane.z;
}
// the night side below the limb: cloud tops catching the first light, a warm rim under the edge
vec3 ma_limbGround(float s, float dep, float hot) {
  float cl = fbm(vec2(s * 2.4, pow(dep, .6) * 7.5) + vec2(uTime * .003, 0.));
  vec3 g = vec3(.014, .010, .012) * (.7 + .7 * cl) + vec3(.07, .055, .06) * smoothstep(.5, .85, cl) * (.3 + .7 * hot) * exp(-dep * 3.5);
  return g + vec3(.40, .10, .02) * exp(-dep / .01) * (.15 + .85 * hot) + vec3(.09, .03, .015) * exp(-dep / .08) * hot;
}
vec3 m_limb(vec2 p, float d, vec2 n, Hole h) {
  float k = ease(uShape);
  if (uShape > 0. && uShape < 1.) d = mix(subjectArc(p), ma_planeTrue(p), k);
  float inside = fill(d, gPix * 1.5);
  // the Earth: the subject itself on the arc; as the plane forms, it sinks until only its dawn shows along the bottom
  float R = uArc.y * mix(1., 1.3, k), top = mix(uArc.x, uCam.y - .515 * uCam.z, k);
  vec2 v = p - vec2(0., top - R);
  float de = length(v) - R, s = atan(v.x, v.y) * R;
  float x = max(de, 0.) / .44, hot = exp(-p.x * p.x / .5);
  float band = .84 + .3 * fbm3(vec2(s * 1.2 + uTime * .006, x * 15.));
  vec3 col = ma_limbAir(x, hot, 1.) * mix(1., band, smoothstep(.04, .25, x));
  // the plane: a black silhouette, burning at the upper edges that face the low sun behind it
  // (a finite difference of d towards the sun, over a long step: unlike n it has no jumps across the medial axes)
  vec2 ps = p - vec2(0., .04 * uPlane.z);
  float dS = k < 1. ? mix(subjectArc(ps), ma_planeTrue(ps), k) : subjectD(ps);
  float hf = exp(-p.x * p.x / .6) * pow(sat((d - dS) / (.04 * uPlane.z) * .75 + .4), 1.5);
  vec3 rim = max(ma_limbAir(max(d, 0.) / (.1 * (.5 + .9 * hf)), hf, .5) - vec3(.009, .013, .026), 0.) * k * (1. - smoothstep(.06, .095, d / uPlane.z));
  col += rim;
  col += vec3(.8, .88, 1.) * ma_stars(p, .12) * smoothstep(.5, 1.1, x) * (1. - sat(luma(rim) * 4.));
  if (de < 2. * gPix) col = mix(col, ma_limbGround(s, max(-de, 0.), hot), fill(de, gPix * 1.5));
  if (d < 2. * gPix) {
    float pd = max(-d, 0.);
    vec3 sil = vec3(.006, .006, .009) + vec3(.55, .17, .04) * exp(-pd / (1.2 * gPix + .002 * uPlane.z)) * (.05 + .7 * hf);
    col = mix(col, k < 1. ? mix(ma_limbGround(s, pd, hot), sil, k) : sil, inside);
  }
  // holes: pinpricks of dawn light through the dark
  if (h.on) {
    float core = fill(h.r - .9, ma_hpx() * 1.5);
    vec3 lc = vec3(1., .72, .44);
    col = mix(col, lc * (1.5 - .6 * h.r), core * inside);
    col += lc * .45 * exp(-max(h.r - .9, 0.) * 2.4) * (1. - core) * inside;
  }
  return col;
}

// ================= 11 nightlimb: the same limb at night =================
vec3 m_nightlimb(vec2 p, float d, vec2 n, Hole h) {
  float k = ease(uShape), inside = fill(d, gPix * 1.5);
  float x = max(d, 0.) / mix(.55, .08, k);
  vec2 uv = uShape < .5 ? ma_arcUV(p) : vec2(p.x, d);
  float band = .88 + .24 * fbm3(vec2(uv.x * 1.1 + uTime * .004, x * mix(9., 4., k)));
  // (on the plane the glow is gone before d = .1, where planeD's far-field shortcut starts)
  float fade = mix(1., 1. - smoothstep(.05, .095, d), k);
  vec3 col = vec3(.014, .021, .032) + (vec3(.22, .33, .39) * exp(-x * 2.6) + vec3(.07, .11, .13) * exp(-x * .9) * (1. - k)) * band * fade;
  col += vec3(.2, .28, .31) * exp(-x * 14.) * mix(1., .6, k);
  col += vec3(.85, .92, 1.) * ma_stars(p, .1) * smoothstep(.2, .8, x);
  float dep = max(-d, 0.);
  vec3 g = vec3(.009, .012, .019) + vec3(.14, .22, .27) * exp(-dep / (1.5 * gPix + .003 * uPlane.z)) * .5;
  if (k < 1.) {
    vec2 gp = vec2(uv.x * 1.4, pow(dep, .65) * 5.);
    float cl = fbm(gp * 1.6 + 3.);
    vec3 gr = vec3(.012, .017, .026) + vec3(.035, .05, .065) * smoothstep(.45, .85, cl);
    gr += vec3(.16, .25, .3) * exp(-dep / .025) + vec3(.04, .065, .08) * exp(-dep / .16);
    // a few towns: tiny warm specks, gathered where people live
    vec2 ci = floor(p * 90.);
    vec3 ck = hash32(ci);
    vec2 cv = p - (ci + .2 + .6 * ck.xy) / 90.;
    float pop = smoothstep(.6, .75, fbm3(p * 3.2 + 9.)) * smoothstep(.0, .04, dep);
    float s = gPix * (.6 + .6 * ck.y);
    gr += vec3(1., .7, .36) * step(.55, ck.z) * pop * (.35 + .65 * ck.x) * (.85 + .15 * sin(uTime * 3. + ck.x * 60.)) * exp(-dot(cv, cv) / (s * s));
    g = mix(gr, g, k);
  }
  col = mix(col, g, inside);
  // holes: warm lights in the dark, like towns
  if (h.on) {
    float core = fill(h.r - .75, ma_hpx() * 1.5);
    vec3 lc = vec3(1., .74, .42);
    col = mix(col, lc * 1.25, core * inside);
    col += lc * .4 * exp(-max(h.r - .75, 0.) * 2.) * (1. - core) * inside;
  }
  return col;
}

// ================= 12 blueprint: chalky lines on Prussian-blue paper =================
float ma_dd(float t, float P) { float m = fract(t / P); return step(m, .6) + step(.7, m) * step(m, .78); }   // dash-dot
float ma_chalk(vec2 p, float prof) {
  float g = .6 * vnoise(p / (gPix * 1.15)) + .4 * vnoise(p / (gPix * 3.1) + 17.);   // the paper's tooth
  float press = .8 + .3 * vnoise(p * 23.);                                           // hand pressure
  return smoothstep(g - .14, g + .14, prof * press * 1.12);
}
vec3 m_blueprint(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float lpx = ma_lpx(), sc = ma_lsc(), dl = d / sc;
  vec2 lp = gLocal;
  // paper: mottled Prussian blue, fibres, a faint printed grid
  float mott = fbm(p * 2.3 + 11.);
  float fib = vnoise(rot(.6) * p * vec2(380., 30.)) + vnoise(rot(-.8) * p * vec2(260., 26.));
  vec3 col = mix(vec3(.07, .18, .35), vec3(.13, .28, .47), mott) * (.9 + .07 * fib);
  vec2 gq = abs(fract(p / .05 + .5) - .5) * .05, gm = abs(fract(p / .25 + .5) - .5) * .25;
  col += vec3(.05, .08, .1) * (.5 * stroke(min(gq.x, gq.y), 0., gPix * 1.3) + .5 * stroke(min(gm.x, gm.y), gPix * .3, gPix * 1.3));
  // the drawing, as one chalk coverage (local units)
  float hwM = max(arc ? .0042 : .0034, 1.2 * lpx), hwT = max(arc ? .0024 : .0017, .9 * lpx);
  float prof = max(ma_tent(dl, hwM), ma_tent(dl + (arc ? .03 : .016), hwT));   // outline, inner offset line
  float sw, ang, rad;
  if (arc) {
    vec2 v = ma_arcV(p);
    float th = atan(v.x, v.y), rr = length(v), R = uArc.y;
    // radial construction lines, a little irregular, poking out above the rim
    float D = .24 / R, kk = floor(th / D + .5);
    float rl = rr * abs(sin(th - (kk + .35 * (hash11(kk + 40.) - .5)) * D));
    float hk = hash11(kk * 3.7 + 1.), top = .02 + .05 * hash11(kk * 5.1), bot = -.1 - .55 * hash11(kk * 9.3);
    float onR = step(hk, .66) * (1. - smoothstep(top - .004, top, d)) * smoothstep(bot - .004, bot, d);
    prof = max(prof, max(ma_tent(rl, hwT), ma_tent(rl - .006, hwT * .8) * step(hk, .2)) * onR);
    // concentric construction circles inside, dash-dot
    float sa = th * R;
    prof = max(prof, max(ma_tent(d + .14, hwT * .8), ma_tent(d + .33, hwT * .8)) * ma_dd(sa, .09));
    // graduation ticks along the rim
    float D5 = D / 5., k5 = floor(th / D5 + .5);
    prof = max(prof, ma_tent(rr * abs(sin(th - k5 * D5)), hwT * .8) * step(0., d) * step(d, mod(k5, 5.) == 0. ? .032 : .015));
    // dash-dot centre line, and construction lines crossing the sky in the upper corners
    prof = max(prof, ma_tent(p.x, hwT) * ma_dd(p.y, .08) * step(-.6, d) * step(d, .06));
    vec2 ap = vec2(abs(p.x), p.y);
    float c1 = sdSeg(ap, vec2(1.45, .02), vec2(.62, .62)), c2 = sdSeg(ap, vec2(1.45, .07), vec2(.72, .6));
    float tk = abs(fract(dot(ap, normalize(vec2(-.83, .56))) / .05) - .5) * .05;
    prof = max(prof, max(ma_tent(c1, hwT), ma_tent(c2, hwT * .8)));
    prof = max(prof, ma_tent(tk, hwT) * step(c1, .018) * step(.6, ap.x));
    sw = sat(atan(v.x, v.y) * R / 2.5 + .5); ang = th; rad = rr;
  } else {
    float ax = abs(lp.x);
    // centre line, wing and tail datum lines, nacelle centre lines (dash-dot)
    prof = max(prof, ma_tent(lp.x, hwT) * ma_dd(lp.y + .01, .075) * step(abs(lp.y), .86));
    prof = max(prof, ma_tent(lp.y - .16, hwT) * ma_dd(lp.x + .02, .075) * step(ax, 1.12));
    prof = max(prof, ma_tent(lp.y + .53, hwT) * ma_dd(lp.x + .02, .075) * step(ax, .5));
    prof = max(prof, ma_tent(ax - (ax < .3675 ? .245 : .49), hwT) * ma_dd(lp.y, .06) * step(abs(lp.y - .3), .27));
    // fuselage stations
    float st = (fract((lp.y - .02) / .1 + .5) - .5) * .1;
    prof = max(prof, ma_tent(st, hwT) * step(ax, .1) * step(abs(lp.y), .66));
    // propeller discs and blades
    for (int i = 0; i < 4; i++) prof = max(prof, ma_tent(length(lp - ENGINE_FRONT[i] - vec2(0., .012)) - .11, hwT));
    prof = max(prof, ma_tent(planeProps(lp), hwT));
    // the span, dimensioned: extension lines, dimension line, end slashes, ticks
    prof = max(prof, ma_tent(ax - .975, hwT) * step(-.84, lp.y) * step(lp.y, -.07));
    prof = max(prof, ma_tent(lp.y + .8, hwT) * step(ax, 1.01));
    prof = max(prof, ma_tent(sdSeg(vec2(ax, lp.y), vec2(.955, -.82), vec2(.995, -.78)), hwM));
    prof = max(prof, ma_tent((fract(lp.x / .1 + .5) - .5) * .1, hwT) * step(lp.y, -.8) * step(-.815, lp.y) * step(ax, .95));
    ang = atan(lp.x, lp.y); sw = fract(ang / TAU + 1.); rad = length(lp);
  }
  // draw-on: the lines appear as the sweep passes, with a bright chalk point at its front
  float prog = uFX2.z;
  float shown = prog >= 1. ? 1. : 1. - smoothstep(prog - .003, prog, sw);
  col = mix(col, vec3(.88, .92, .95), ma_chalk(p, prof) * shown * .92);
  // holes: small rings of red chalk, each with a tiny cross (the cross once it is big enough to read)
  if (h.on && d < 4. * gPix) {
    float hp = ma_hpx(), hw = max(.16, hp * .9);
    float hm = max(ma_tent(h.r - 1.2, hw), max(ma_tent(h.o.x, hw), ma_tent(h.o.y, hw)) * step(h.r, .7) * sat(2.5 - hp * 8.));
    col = mix(col, vec3(1., .5, .4), ma_chalk(p + 3.7, hm) * shown * .9);
  }
  if (prog > 0. && prog < 1.) {
    float fa = arc ? (prog - .5) * 2.5 / uArc.y : prog * TAU;
    float da = ang - fa;
    da -= TAU * floor(da / TAU + .5);
    float dist = rad * abs(sin(da)) + step(cos(da), 0.);
    float pen = exp(-(dist * dist + dl * dl) / .00012), glow = exp(-sqrt(dist * dist + dl * dl) / .02);
    col += vec3(1., .97, .9) * pen * 2.2 + vec3(.7, .85, 1.) * glow * .25;
  }
  return col;
}

// ================= 13 metal: the hangar at night =================
// panel seams on the B-17's skin: x = signed distance to the nearest seam, y = position along it, z = panel id
vec3 ma_seams(vec2 lp, int z) {
  float ax = abs(lp.x), side = lp.x < 0. ? 101. : 0.;
  if (z == 2) {
    float fy = (fract(lp.y / .07 + .5) - .5) * .07, row = floor(lp.y / .07 + .5), sx = ax - .03;
    float id = row * 3. + 1. + step(0., sx) + side;
    return abs(fy) < abs(sx) ? vec3(fy, lp.x, id) : vec3(sx, lp.y, id);
  }
  if (z == 0) return vec3((fract(lp.y / .045 + .5) - .5) * .045, lp.x, floor(lp.y / .045 + .5) + 300. + side);
  bool tl = lp.y < -.3;
  float le = tl ? -.405 - .372 * ax : .335 - .2586 * ax, te = tl ? -.645 + .077 * ax : -.012 - .0105 * ax;
  float ch = max(le - te, .02), c = (lp.y - te) / ch, rib = tl ? .065 : .1;
  float rx = (fract(ax / rib + .5) - .5) * rib;
  float c1 = (c - .28) * ch, c2 = (c - .8) * ch, sp = abs(c1) < abs(c2) ? c1 : c2;
  float id = floor(ax / rib + .5) * 4. + step(.28, c) + step(.8, c) + (tl ? 500. : 600.) + side;
  return abs(rx) < abs(sp) ? vec3(rx, lp.y, id) : vec3(sp, ax, id);
}
vec3 ma_metalHole(vec3 col, Hole h, vec3 L3, float I, vec3 lampC) {
  float hp = ma_hpx(), r = h.r, a = atan(h.o.y, h.o.x), s = h.seed * 40.;
  float jag = .09 * sin(a * 3. + s) + .06 * sin(a * 7. - s * 1.3) + .04 * sin(a * 13. + s * 2.1);
  // soot, and a ring of chipped paint showing dull aluminium
  col *= 1. - .5 * (1. - smoothstep(.95, 2.2, r + .25 * sin(a * 5. + s * 1.9) + .12 * sin(a * 12. + s)));
  vec3 alu = vec3(.5, .51, .53) * (.8 + .3 * sin(a * 23. + r * 9. + s));
  col = mix(col, alu * lampC * (.08 + 1.1 * I * max(L3.z, 0.)), fill(r - (1.18 + 1.2 * jag + .06 * sin(a * 17. - s)), hp * 1.5) * .9);
  // petals of torn metal bent into the hole: lit on the far side, shadowed on the near side
  vec2 dir = h.o / max(r, 1e-3);
  float pa = fract(a / TAU * 6. + h.seed * 3.);
  vec3 Np = normalize(vec3(-dir * (.7 + .5 * fract(pa + h.seed)), .5));
  float lit = max(dot(Np, L3), 0.), spec = pow(max(dot(Np, normalize(L3 + vec3(0., 0., 1.))), 0.), 24.);
  vec3 pet = (vec3(.62, .63, .65) * lampC * (.04 + 1.1 * I * lit) + lampC * spec * I) * (.4 + .6 * smoothstep(0., .1, min(pa, 1. - pa)));
  col = mix(col, pet, fill(r - (.97 + .5 * jag + .04 * sin(a * 29. + s)), hp * 1.5));
  return mix(col, vec3(.008, .007, .006), fill(r - (.7 + jag), hp * 1.5));   // the opening
}
vec3 m_metal(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float inside = fill(d, gPix * 1.5);
  vec2 lamp = vec2(0., .12), lv = p - lamp;
  float I = pow(1.2 / (1.2 + dot(lv, lv)), 2.);                    // a pool of tungsten light from a lamp overhead
  vec3 L3 = normalize(vec3(-lv, 1.1)), lampC = vec3(1., .78, .52), Hv = normalize(L3 + vec3(0., 0., 1.));
  vec3 floorC = vec3(0.), skin = vec3(0.);
  if (d > -2. * gPix) {
    // concrete: fine aggregate, faint trowel mottling, a few oil stains, saw-cut joints
    float agg = .6 * vnoise(p * 190.) + .4 * vnoise(p * 470. + 5.);
    vec3 conc = vec3(.35, .345, .335) * (.88 + .18 * fbm(p * 2.5 + 1.7)) * (.84 + .25 * agg);
    // oil stains: isolated drips and pools, darker at their rims
    vec2 si = floor(p / .45);
    vec3 sk = hash32(si + 71.);
    float sr = .025 + .085 * sk.z * sk.z;
    float sd = length(p - (si + .25 + .5 * sk.xy) * .45) - sr * (1. + .7 * (vnoise(p * 28. + sk.xy * 9.) - .5));
    float oil = step(.5, fract(sk.z * 7.3)) * (1. - smoothstep(-.006, .003, sd));
    conc *= 1. - oil * (.35 + .3 * exp(-pow(sd / .006, 2.))) * (.8 + .2 * agg);
    vec2 sj = abs(fract(p / 1.2 + .5) - .5) * 1.2;
    float jd = min(sj.x, sj.y);
    conc = conc * (1. - .6 * stroke(jd, .0012, gPix * 1.5)) + .03 * stroke(jd - .003, .0008, gPix * 1.5);
    // the plane's shadow, cast by the lamp: the silhouette scaled out from the point under the lamp
    float sh = arc ? 1. : mix(.22, 1., smoothstep(-.02, .07, subjectD(lamp + lv * .93) / uPlane.z));
    floorC = conc * (lampC * 1.2 * I * sh + vec3(.05, .07, .1) * (1. - .6 * I)) + lampC * .07 * pow(I, 6.) * (1. - .6 * oil) * sh;
  }
  if (d < 2. * gPix) {
    float sc = ma_lsc(), lpx = ma_lpx(), dl = d / sc;
    vec2 lp = gLocal, nl = ma_nl(n);
    float ax = abs(lp.x);
    vec3 sm;
    if (arc) {
      vec2 uv = ma_arcUV(p);
      float dep = -uv.y, row = floor(dep / .12), cy = (fract(dep / .12 + .5) - .5) * .12;
      float ux = uv.x + row * .15, rx = (fract(ux / .3 + .5) - .5) * .3, id = row * 37. + floor(ux / .3 + .5);
      sm = abs(cy) < abs(rx) ? vec3(cy, uv.x, id) : vec3(rx, dep, id);
    } else sm = ma_seams(lp, gZone);
    // olive drab, faded panel by panel, streaked aft by rain and oil
    float ph = hash11(sm.z * 1.31 + .7), mott = fbm(lp * 6. + ph * 9.);
    vec3 od = mix(vec3(.2, .225, .12), vec3(.25, .235, .14), hash11(sm.z * 7.9)) * (.84 + .3 * ph) * (.86 + .24 * mott);   // replacement panels differ
    od = mix(od, od * vec3(1.1, 1.02, .82), smoothstep(.6, .8, mott) * .45) * (.92 + .1 * vnoise(vec2(lp.x * 140., lp.y * 5.)));
    float wn = fbm3(lp * 55. + 4.), walk = 0.;
    if (!arc && gZone == 1 && lp.y > -.3) {
      // oily exhaust streaks behind the engines, and the walkway worn by the crew at the wing root
      float nx = ax < .3675 ? .245 : .49, le = .335 - .2586 * ax;
      float stain = exp(-pow((ax - nx) / .03, 2.)) * smoothstep(le - .08, le - .18, lp.y) * (.55 + .45 * vnoise(vec2(ax * 110., lp.y * 7.)));
      od = mix(od, vec3(.05, .045, .035), stain * .6);
      walk = (1. - smoothstep(.08, .17, ax)) * smoothstep(.0, .05, lp.y) * (1. - smoothstep(.2, .3, lp.y));
    }
    // wear to bare aluminium: the leading edges most, then seams, tips and the walkway
    float seamP = 1. - smoothstep(0., .005, abs(sm.x));
    float wear = exp(dl / .009) * (.3 + .7 * sat(nl.y)) + .3 * seamP + .3 * walk;
    float bare = smoothstep(.5, .56, wear * .95 + (wn - .5) * .7);
    vec3 alu = vec3(.60, .62, .64) * (.85 + .2 * vnoise(vec2(lp.x * 30., lp.y * 500.)));
    vec3 base = mix(od, alu, bare);
    if (!arc) {
      // the national insignia on the left wing: a white star in a blue disc (1943)
      vec2 ip = lp - vec2(-.62, .06);
      vec3 ins = mix(vec3(.09, .13, .32), vec3(.86, .85, .8), fill(sdStar5(ip, .066, .38) * sc, gPix * 1.5)) * (.85 + .2 * mott);
      base = mix(base, ins, fill((length(ip) - .07) * sc, gPix * 1.5) * (1. - bare * .85));
    }
    // light: the skin curves away at the edges (the fuselage is a cylinder), painted sheen, glints on bare metal
    float bw = arc ? .03 : gZone == 2 ? .07 : gZone == 0 ? .04 : .016;
    float t = sat(1. + dl / bw);
    vec3 N = normalize(vec3(n * t, sqrt(max(1. - t * t, .02))));
    float nh = max(dot(N, Hv), 0.);
    skin = base * (lampC * 1.25 * I * max(dot(N, L3), 0.) + vec3(.07, .09, .13) * (.4 + .6 * N.z)) + lampC * I * mix(pow(nh, 8.) * .16, pow(nh, 50.) * .7, bare);
    // seams: a dark gap with a lit lip; rivet rows along them
    skin *= 1. - .55 * stroke(sm.x, arc ? .0006 : .0004, lpx * 1.5);
    skin += lampC * I * .05 * stroke(sm.x - .0012, .0003, lpx * 1.5);
    float pitch = .0075;
    vec2 rq = vec2(abs(sm.x) - .0042, (fract(sm.y / pitch + .5) - .5) * pitch) / .0016;
    float rl = ma_lod(pitch * sc), rv = sat(1. - dot(rq, rq)) * rl;
    skin += lampC * I * .06 * stroke(abs(sm.x) - .0042, .0008, lpx * 1.5) * (1. - rl);   // rows too fine to resolve: a faint lit line
    vec3 RN = normalize(vec3(rq * .8, 1.));
    skin += lampC * I * rv * (.25 * max(dot(RN, L3), 0.) + .6 * pow(max(dot(RN, Hv), 0.), 20.)) - skin * rv * .3 * sat(-dot(RN.xy, L3.xy));
    if (h.on) skin = ma_metalHole(skin, h, L3, I, lampC);
  }
  return mix(floorC, skin, inside);
}

// ================= 14 embroidery: slate silk satin stitch on cream linen =================
vec3 ma_linen(vec2 p) {
  const float P = .0105;
  vec2 g = p / P, i = floor(g), f = fract(g);
  bool up = mod(i.x + i.y, 2.) > .5;
  float sx = .72 + .28 * vnoise(vec2(i.x * 3.7, g.y * .11)), sy = .72 + .28 * vnoise(vec2(g.x * .11, i.y * 3.7));
  float wv = sat(1. - abs(f.x - .5) * 2. / sx), wf = sat(1. - abs(f.y - .5) * 2. / sy);
  float lum = up ? max(sqrt(wv), sqrt(wf) * .7) : max(sqrt(wf), sqrt(wv) * .7);
  float fleck = hash11(up ? i.x * 1.3 : i.y * 7.9 + 50.);
  vec3 base = vec3(.84, .78, .66);
  return mix(base * .86, base * (.9 + .12 * fleck) * (.55 + .45 * lum), ma_lod(P)) * (.94 + .08 * vnoise(p * 7.));
}
vec3 ma_satin(float ac, float al, vec2 dir, float sc) {
  const float W = .0045;
  float a = ac / W, ti = floor(a), tf = fract(a);
  float e = fract(al / .055 + hash11(ti * .731 + 2.));                    // long-and-short stitches
  float lod = ma_lod(W * sc);
  float pr = mix(.8, sqrt(sat(sin(PI * tf))), lod);
  float sheen = pow(abs(dot(vec2(-dir.y, dir.x), normalize(vec2(-.55, .83)))), 2.);   // threads across the light shine
  vec3 c = mix(vec3(.10, .14, .21), vec3(.30, .38, .50), pr) * mix(1., .9 + .2 * hash11(ti * 3.1), lod);
  c += vec3(.30, .34, .38) * sheen * pow(pr, 5.) * (.75 + .25 * sin(al * 900. + ti * 2.) * lod);
  return c * mix(1., .55 + .45 * smoothstep(0., .05, e) * smoothstep(0., .05, 1. - e), lod);
}
vec3 m_embroidery(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float sc = ma_lsc(), lpx = ma_lpx(), dl = d / sc, inside = fill(d, gPix * 1.5);
  vec2 lp = gLocal, nl = ma_nl(n);
  vec3 col = ma_linen(p) * (1. - .22 * exp(-max(dl, 0.) / .006));
  vec2 dir;
  float ac, al, e;
  if (arc) {
    vec2 v = ma_arcV(p);
    dir = normalize(v); ac = atan(v.x, v.y) * uArc.y; al = uArc.y - length(v); e = ac;
  } else {
    float sx = lp.x < 0. ? -1. : 1.;
    dir = gZone == 1 ? (lp.y < -.3 ? normalize(vec2(.36 * sx, .93)) : normalize(vec2(.26 * sx, 1.))) : vec2(1., 0.);
    ac = dot(lp, vec2(-dir.y, dir.x)); al = dot(lp, dir); e = dot(lp, vec2(-nl.y, nl.x));
  }
  vec3 silk = ma_satin(ac, al, dir, sc);
  float t = sat(1. + dl / .012);
  silk *= .45 + .75 * dot(normalize(vec3(n * t * 1.3, 1.)), normalize(vec3(-.5, .65, .6)));   // padded: threads roll over the edge
  col = mix(col, silk, inside);
  // running stitch just outside the satin
  float sp = .022, ef = fract(e / sp);
  vec2 sq = vec2(max(abs(ef - .3) * sp - .3 * sp + .0016, 0.), dl - .0068);
  float rs = fill((length(sq) - .0016) * sc, gPix * 1.5);
  float tz = sat(1. - pow((dl - .0068) / .0016, 2.));
  col *= 1. - .3 * fill((length(sq - vec2(0., -.0012)) - .0018) * sc, gPix * 3.) * (1. - rs);
  col = mix(col, vec3(.62, .44, .16) * (.5 + .6 * sqrt(tz)) + vec3(.25, .2, .12) * pow(tz, 8.), rs);
  // holes: raised red French knots
  if (h.on && (uShape > .99 || d < 0.)) {
    float hp = ma_hpx();
    col *= 1. - .45 * (1. - smoothstep(-.3, .6, length(h.o - vec2(.28, -.36)) - 1.05));
    vec2 o = h.o / 1.1;
    float r = length(o), z = sqrt(max(1. - r * r, 0.));
    vec3 N = vec3(o, z);
    float coil = .5 + .5 * sin(atan(o.y, o.x) * 3. + r * 9. + h.seed * 20.);
    float dif = max(dot(N, normalize(vec3(-.5, .6, .7))), 0.);
    vec3 red = vec3(.58, .06, .05) * (.35 + .8 * dif) * (.7 + .4 * coil) + vec3(.5, .3, .28) * pow(max(dot(N, normalize(vec3(-.25, .3, 1.))), 0.), 16.) * coil;
    col = mix(col, red, fill(h.r - 1.1, hp * 1.5));
  }
  return col;
}

// ================= 15 halftone: a 1943 newspaper =================
float ma_screen(vec2 u, float tone, float spread, float aa) {
  float f = .5 + .25 * (cos(TAU * u.x) + cos(TAU * u.y));
  return smoothstep(1. - tone - aa, 1. - tone + aa, f + spread);
}
vec3 m_halftone(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float sc = ma_lsc(), lpx = ma_lpx(), dl = d / sc, inside = fill(d, gPix * 1.5);
  vec2 lp = gLocal, nl = ma_nl(n);
  // newsprint: yellowed, fibrous, a little uneven, a few foxing stains
  float mott = fbm(p * 2.6 + 5.);
  float fib = .5 * vnoise(rot(.4) * p * vec2(520., 45.)) + .5 * vnoise(rot(-1.1) * p * vec2(430., 40.));
  vec3 paper = vec3(.79, .76, .65) * (.93 + .08 * mott) * (.97 + .05 * fib);
  paper *= 1. - .05 * smoothstep(.6, .8, fbm3(p * 9. + 2.));
  // the tone of the printed photograph: a soft light from the top left
  float tone = arc ? .18 + .55 * smoothstep(0., .6, -dl) + .08 * lp.x
                   : .42 - .14 * lp.y + .12 * lp.x + (.2 * dot(nl, vec2(.6, -.8)) + .08) * exp(dl / .035);
  tone = clamp(tone, .06, .92);
  // black at 45 degrees; a second ink at 15 degrees, out of register
  const float P = .0125;
  float spread = .07 * (vnoise(p * 230.) - .5), aa = 1.4 * lpx / P;
  float k1 = ma_screen(rot(.785398) * lp / P, tone, spread, aa) * inside;
  vec2 off = vec2(.0045, -.0032);
  float k2 = ma_screen(rot(.261799) * (lp - off) / P, .3 + .15 * (tone - .4), spread, aa) * fill(d - dot(n, off * sc), gPix * 1.5);
  vec3 col = paper * mix(vec3(1.), vec3(.93, .38, .30), k2 * .85) * (1. - .9 * k1);
  // holes: bold solid ink dots, spreading into the fibres
  if (h.on && (uShape > .99 || d < 0.)) {
    float hp = ma_hpx(), a = atan(h.o.y, h.o.x);
    float rim = 1. + .07 * sin(a * 5. + h.seed * 30.) + .05 * sin(a * 11. + h.seed * 9.);
    float ink = fill(h.r - rim, hp * 1.5);
    float feather = (1. - smoothstep(rim, rim + .35, h.r)) * smoothstep(.45, .75, fib + .3 * vnoise(h.o * 6.));
    float salt = step(.93, hash21(floor(h.o * 5.) + h.seed * 99.)) * .5;
    col = mix(col, paper * .1, max(ink * (1. - salt * .6), feather * .8));
  }
  return col;
}

// ================= 16 stainedglass: glass and lead came, lit from behind =================
vec3 m_stainedglass(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5, inS = d < 0.;
  float sc = ma_lsc();
  vec2 c = inS ? gLocal : p;
  float S = inS ? (arc ? 6.5 : 12.) : (arc ? 4. : 4.8), wsc = inS ? sc : 1.;
  vec2 cw = c * S + .22 * vec2(vnoise(c * 7.), vnoise(c * 7. + 4.3));   // hand-cut: slightly wobbly lines
  vec3 v = voronoi(cw);
  if (isnan(v.x) || isnan(v.y) || isnan(v.z)) return vec3(1., 0., 1.);
  if (v.y < -.01) return vec3(0., 1., 0.);
  float k = fract(v.z * 7.31 + (inS ? .5 : 0.));
  vec3 g = inS ? (k < .32 ? vec3(1., .52, .07) : k < .55 ? vec3(.98, .74, .2) : k < .8 ? vec3(.78, .1, .07) : vec3(.96, .34, .06))
               : (k < .42 ? vec3(.06, .15, .6) : k < .68 ? vec3(.03, .08, .34) : k < .84 ? vec3(.03, .38, .2) : vec3(.26, .4, .74));
  // the light behind the window drifts; streaks and thickness inside each piece
  float Lt = .75 + .45 * fbm3(p * 1.3 + vec2(uTime * .025, uTime * .01));
  float str = vnoise(rot(v.z * 31.) * cw * vec2(.7, 7.) + v.z * 50.);
  vec3 col = g * Lt * (.72 + .45 * str) * (.5 + .55 * smoothstep(0., .35, v.y));
  // seeds: tiny bubbles in the glass
  vec2 bi = floor(c * 70.);
  vec3 bk = hash32(bi);
  float br = length(c - (bi + .25 + .5 * bk.xy) / 70.) / (.0025 + .003 * bk.z);
  col *= 1. + step(.93, bk.z) * (.7 * exp(-pow((br - .8) / .15, 2.)) - .3 * (1. - smoothstep(.2, .6, br))) * ma_lod(.005 * wsc);
  // lead came: between the pieces and around the subject
  float w = .0048 * S / wsc, aaC = gPix * S / wsc * 1.2;
  float lead = max(1. - smoothstep(w - aaC, w + aaC, v.y), stroke(d, .006, gPix * 1.5));
  col *= .6 + .4 * smoothstep(w, w * 2.6, v.y);
  float hl = max(exp(-pow(v.y / (w * .45), 2.)), exp(-pow(d / .0028, 2.)));
  col = mix(col, vec3(.035, .035, .04) + vec3(.13, .12, .11) * hl, lead);
  // holes: round jewel cabochons set in lead
  if (h.on && (uShape > .99 || d < 0.)) {
    float hp = ma_hpx(), r = h.r;
    col = mix(col, vec3(.035, .035, .04) + .14 * exp(-pow((r - 1.16) / .1, 2.)), fill(r - 1.32, hp * 1.5));
    vec3 jc = fract(h.seed * 3.7) < .5 ? vec3(.9, .06, .1) : vec3(.1, .3, .95);
    float z = sqrt(max(1. - r * r, 0.));
    vec2 hq = h.o - vec2(-.35, .38), cq = h.o - vec2(.3, -.35);
    vec3 jewel = jc * (.35 + 1.1 * z) * Lt + vec3(1.) * exp(-dot(hq, hq) / .03) * 1.2 + jc * .6 * exp(-dot(cq, cq) / .08);
    col = mix(col, jewel, fill(r - 1., hp * 1.5));
  }
  return col;
}

// ================= 17 cells: a stained section of plant tissue under the microscope =================
vec3 ma_cell(vec3 v, float S, float lpx, float wall, vec3 wallC, vec3 lumC) {
  float aa = lpx * S * 1.5, w = wall * (.75 + .5 * hash11(v.z * 91.3));
  float lum = smoothstep(w - aa, w + aa, v.y);
  vec3 c = mix(wallC, lumC * (.9 + .15 * smoothstep(0., .35, v.y - w)), lum);
  return mix(c, wallC * .45, (1. - smoothstep(0., .025 + aa, v.y)) * .6);   // the dark middle lamella
}
vec3 m_cells(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float sc = ma_lsc(), lpx = ma_lpx(), dl = d / sc, dep = -dl, inside = fill(d, gPix * 1.5);
  vec2 lp = gLocal;
  vec3 col = vec3(.80, .80, .74) * (.94 + .08 * fbm3(p * 2.));
  if (d < 2. * gPix) {
    float cw = arc ? .05 : .02, cort = 1. - smoothstep(cw * .8, cw * 1.25, dep), bund;
    if (arc) {
      vec2 uv = ma_arcUV(p);
      float bk = floor(uv.x / .3 + .5);
      vec2 bq = (uv - vec2((bk + .3 * (hash11(bk) - .5)) * .3, -(.1 + .03 * hash11(bk + 7.)))) / vec2(.055, .045);
      bund = 1. - smoothstep(.8, 1.05, length(bq));
    } else {
      vec2 a = vec2(abs(lp.x), lp.y);
      float vein = min(abs(lp.x), min(sdSeg(a, vec2(.05, .17), vec2(.92, .045)), sdSeg(a, vec2(.04, -.52), vec2(.37, -.58))));
      bund = 1. - smoothstep(.009, .016, vein);
    }
    float Sc = arc ? 17. : 30.;
    vec3 vc = voronoi(lp * Sc + 3.1);
    vec3 tis = ma_cell(vc, Sc, lpx, .07, vec3(.2, .47, .44), vec3(.85, .9, .82));
    tis = mix(tis, vec3(.3, .1, .38), step(hash11(vc.z * 13.), .3) * (1. - smoothstep(.1, .14, vc.x)) * .8);   // nuclei
    if (cort + bund > .001) {
      float Sf = Sc * 2.6;
      vec3 vf = voronoi(lp * Sf + 7.7);
      tis = mix(tis, ma_cell(vf, Sf, lpx, .14, vec3(.03, .22, .26), vec3(.22, .6, .5)), bund);
      tis = mix(tis, ma_cell(vf, Sf, lpx, .12, vec3(.04, .3, .31), vec3(.78, .86, .34)), cort);
    }
    tis = mix(tis, vec3(.15, .12, .45), stroke(dl + .0025, .0022, lpx * 1.5));   // epidermis
    // holes: dark purple nuclei, each with a clear halo
    if (h.on && (uShape > .99 || d < 0.)) {
      float hp = ma_hpx(), r = h.r;
      tis *= mix(vec3(1.), vec3(.85, .7, .9), (1. - smoothstep(1., 2.4, r)) * .5);
      tis = mix(tis, vec3(.93, .92, .86), exp(-pow((r - 1.35) / .3, 2.)) * .6);
      vec3 nc = mix(vec3(.28, .06, .36), vec3(.45, .16, .55), vnoise(h.o * 3. + h.seed * 40.)) * (.8 + .3 * (1. - r));
      tis = mix(tis, nc, fill(r - .95 - .08 * sin(atan(h.o.y, h.o.x) * 3. + h.seed * 9.), hp * 1.5));
    }
    col = mix(col, tis, inside);
  }
  // the circular field of the microscope
  float fr = length(ma_scr(p));
  col = mix(vec3(.015, .015, .02), col, 1. - smoothstep(.62, .7, fr));
  return col;
}

// ================= 18 collage: cut paper, after Matisse =================
vec3 ma_paper(vec2 p, vec3 c, float seed) {
  float f = .55 * vnoise(p * 210. + seed * 7.) + .45 * vnoise(p * 55. + seed * 3.);
  float br = vnoise(rot(seed * 2.) * p * vec2(5., 70.) + seed);    // gouache brush streaks
  return c * (.92 + .1 * f + .08 * (br - .5));
}
vec3 m_collage(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float sc = ma_lsc(), lpx = ma_lpx(), aa = lpx * 1.5;
  vec2 lp = gLocal, nl = ma_nl(n), off = vec2(.005, -.008);
  vec3 col = ma_paper(p, vec3(.84, .72, .62), 1.);
  float dA = d / sc + (vnoise(lp * 21.) - .5) * .008 + (vnoise(lp * 70.) - .5) * .0025;
  col *= 1. - .35 * (1. - smoothstep(-.006, .01, dA - dot(nl, off)));     // drop shadow
  col = mix(col, ma_paper(p, vec3(.10, .17, .52), 2.), fill(dA, aa));
  if (arc) {
    // shapes cut from other papers and laid on the blue
    float best = 1e9, id = 0.;
    for (int i = 0; i < 7; i++) {
      float fi = float(i), x = -1.2 + fi * .4 + (hash11(fi * 3.1) - .5) * .12;
      vec2 q = lp - vec2(x, -.12 - .1 * hash11(fi * 7.7) - .06 * abs(x));
      q = rot((hash11(fi * 5.3) - .5) * 1.5) * q;
      float sd;
      if (i == 0 || i == 4) sd = length(q) - .07;                                           // disc
      else if (i == 1 || i == 5) sd = max(length(q - vec2(.05, 0.)) - .085, length(q + vec2(.05, 0.)) - .085);   // leaf
      else if (i == 2) sd = max(length(q) - .08, -(length(q - vec2(.035, .02)) - .07));     // crescent
      else sd = sdStar5(q, .085, .45) - .006;                                               // star
      sd += (vnoise(q * 40. + fi) - .5) * .006;
      if (sd < best) { best = sd; id = fi; }
    }
    vec3 pc = id < .5 ? vec3(.97, .83, .2) : id < 1.5 ? vec3(.82, .12, .1) : id < 2.5 ? vec3(.05, .05, .06)
            : id < 3.5 ? vec3(.07, .5, .3) : id < 4.5 ? vec3(.92, .45, .6) : id < 5.5 ? vec3(.05, .45, .3) : vec3(.97, .55, .12);
    col = mix(col, ma_paper(p, pc, 3. + id), fill(best, aa) * fill(dA + .02, aa));
  } else {
    // the fuselage (black) and the nacelles (lemon), cut separately and laid on top
    float cb = (vnoise(lp * 33. + 5.) - .5) * .006;
    float dN = pl_nac(lp) + cb, dF = pl_fus(lp) + cb;
    float shd = 1. - smoothstep(-.005, .008, min(pl_nac(lp - off), pl_fus(lp - off)) + cb);
    col *= 1. - .35 * shd * (1. - fill(min(dN, dF), aa)) * fill(dA, aa);
    col = mix(col, ma_paper(p, vec3(.95, .80, .16), 3.), fill(dN, aa));
    col = mix(col, ma_paper(p, vec3(.06, .06, .07), 4.), fill(dF, aa));
  }
  // holes: punched red confetti, each with a small shadow
  if (h.on && (uShape > .99 || d < 0.)) {
    float hp = ma_hpx();
    col *= 1. - .4 * (1. - smoothstep(.75, 1.3, length(h.o - vec2(.22, -.3))));
    vec3 conf = ma_paper(p, vec3(.86, .12, .1), 6.) * (1. + .15 * stroke(h.r - .92, .06, .1) * dot(h.o / max(h.r, .01), vec2(-.7, .7)));
    col = mix(col, conf, fill(h.r - 1., hp * 1.5));
  }
  return col;
}

// ================= 19 engraving: banknote-style etching in sepia =================
vec3 m_engraving(vec2 p, float d, vec2 n, Hole h) {
  bool arc = uShape < .5;
  float sc = ma_lsc(), lpx = ma_lpx(), dl = d / sc, inside = fill(d, gPix * 1.5);
  vec2 lp = gLocal, nl = ma_nl(n);
  vec3 paper = vec3(.80, .76, .63) * (.95 + .06 * fbm3(p * 4.)) * (.98 + .03 * vnoise(p * 300.));
  // a guilloche rosette behind, very faint
  vec2 rv = p - (arc ? vec2(0., uArc.x - uArc.y) : uPlane.xy);
  float rr = length(rv), th = atan(rv.y, rv.x), N = arc ? 140. : 22.;
  float g1 = rr / .03 + .45 * sin(N * th), g2 = rr / .03 + .45 * sin(N * th + PI), gw = gPix / .03 * 1.4;
  float gl = max(sat(1. - (abs(fract(g1) - .5) - .04) / gw), sat(1. - (abs(fract(g2) - .5) - .04) / gw));
  float env = arc ? smoothstep(uArc.y, uArc.y + .02, rr) * (1. - smoothstep(uArc.y + .35, uArc.y + .6, rr)) : smoothstep(.15, .3, rr) * (1. - smoothstep(1.3, 1.6, rr));
  float cov = gl * .2 * env;
  // the subject: bevelled relief, hatched by the light
  float bw = arc ? .1 : gZone == 2 ? .065 : gZone == 0 ? .04 : .03;
  float t = sat(1. + dl / bw);
  vec3 L = normalize(vec3(-.55, .62, .55));
  float dark = sat(1.15 - 1.35 * dot(normalize(vec3(n * t * 1.6, 1.)), L));
  float S = arc ? .0095 : .0125, aaS = lpx / S * 1.2;
  float w1 = .06 + .42 * dark;
  float hatch = sat((w1 - abs(fract(dot(lp, vec2(-.565, .825)) / S) - .5)) / aaS + .5);
  float cont = sat((w1 - abs(fract(dl / (S * .9)) - .5)) / aaS + .5);
  float xh = sat(((dark - .55) * .9 - abs(fract(dot(lp, vec2(.644, .765)) / S) - .5)) / aaS + .5) * step(.55, dark);
  cov = mix(cov, max(mix(hatch, cont, smoothstep(.2, .6, t)), xh), inside);
  cov = max(cov, stroke(dl, .0013 + .0022 * sat(-dot(nl, L.xy) * 1.5), lpx * 1.5));   // the outline, heavier in shadow
  if (!arc) {
    // cast shadow on the paper: ruled lines
    float ds = subjectD(p - vec2(.028, -.04) * sc) / sc;
    float sh = (1. - smoothstep(-.01, .01, ds)) * step(0., dl);
    cov = max(cov, sh * sat((.18 - abs(fract(lp.y / .009) - .5)) / (lpx / .009 * 1.2) + .5));
  }
  // holes: tiny engraved rings, with a crescent of shadow inside
  if (h.on && (uShape > .99 || d < 0.)) {
    float hp = ma_hpx(), inH = fill(h.r - 1., hp * 1.5);
    cov *= 1. - inH;
    float cres = inH * (1. - fill(length(h.o - vec2(.32, -.32)) - .95, hp * 1.5));
    cov = max(cov, cres * sat((.3 - abs(fract(dot(h.o, vec2(.7, .7)) * 2.2) - .5)) / (hp * 2.2) + .5));
    cov = max(cov, ma_tent(h.r - 1.05, max(.13, hp * 1.1)));
  }
  return mix(paper, vec3(.23, .13, .06), cov * .92);
}
`;
  const defs = [[10, "limb", "light"], [11, "nightlimb", "light"], [12, "blueprint", "light"], [13, "metal", "light"], [14, "embroidery", "dark"],
    [15, "halftone", "dark"], [16, "stainedglass", "light"], [17, "cells", "dark"], [18, "collage", "dark"], [19, "engraving", "dark"]];
  for (const [id, name, ink] of defs) H.mediaDefs.push({ id, name, ink, fn: "m_" + name, glsl });
})();
