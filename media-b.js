// Media B (ids 20-29): constellation, ink, xray, sun, topo, kintsugi, record, treerings, stone, coin.
// Each is  vec3 m_<name>(vec2 p, float d, vec2 n, Hole h)  (see ENGINE.md). Helpers carry the mb_ prefix.
// All ten share one GLSL string, which the engine includes once.
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.mediaDefs = H.mediaDefs || [];
  const glsl = /* glsl */ `
// ---------------- media-b helpers ----------------
float mb_sc() { return uShape > .5 ? uPlane.z : 1.; }                       // world units per local unit
vec2 mb_nl(vec2 n) { return uShape > .5 ? rot(-uPlane.w) * n : n; }         // the outward normal in local space
float mb_hpx() { return gPix / (HOLE_R * uPlane.z); }                       // one pixel, in hole radii
vec2 mb_scr(vec2 p) { return rot(-uCam.w) * (p - uCam.xy) / uCam.z; }       // screen position
float mb_lost(Hole h) { return float(h.kind == 2 || h.kind == 4); }
// the arc in polar form: x = distance outside the arc (like d), y = arc length from its top
vec2 mb_polar(vec2 p) { vec2 c = p - vec2(0., uArc.x - uArc.y); return vec2(length(c) - uArc.y, atan(c.x, c.y) * uArc.y); }
// a coordinate running along the subject's edge: arc length on the arc, position along the nearest edge on the plane
float mb_along(vec2 p, vec2 nl) { return uShape > .5 ? dot(gLocal, vec2(nl.y, -nl.x)) : mb_polar(p).y; }
// anti-aliased lines at the integers of v (fw = change of v per pixel, w = half width in pixels);
// lines closer than ~3 px fade into their mean ink so they never shimmer
float mb_lines(float v, float fw, float w) {
  fw = max(fw, 1e-6);
  return mix(sat(w + .5 - abs(fract(v + .5) - .5) / fw), min(2. * w * fw, 1.), smoothstep(.2, .45, fw));
}
// engraving: lines at the integers of v whose width swells with the darkness t (0..1)
float mb_engrave(float v, float fw, float t) {
  fw = max(fw, 1e-6);
  float hw = t * .5, line = sat((hw - abs(fract(v + .5) - .5)) / fw + .5) * sat(hw / fw * 2.);
  return mix(line, t, smoothstep(.22, .45, fw));
}
// polished gold under a studio softbox; N in screen space, sq = screen position (for the view ray)
vec3 mb_gold(vec3 N, vec2 sq, float matte) {
  vec3 V = normalize(vec3(-sq * .45, 1.)), R = reflect(-V, N);
  float key = smoothstep(.15, .95, dot(R, normalize(vec3(-.5, .4, .77))));
  float strip = pow(sat(dot(R, normalize(vec3(.8, .35, .5)))), 14.);
  float env = .05 + .8 * key * key + .6 * strip + .08 * sat(R.y + .3);
  float dif = sat(dot(N, normalize(vec3(-.45, .55, .7))));
  env = mix(env, .1 + .5 * dif, matte);
  return vec3(1., .74, .32) * env + vec3(1., .9, .7) * pow(key, 14.) * .5 * (1. - matte);
}

// ================= 20 constellation =================
vec3 mb_starTint(float k) { return mix(vec3(.66, .78, 1.), vec3(1., .84, .64), k); }
// one layer of stars: cells of 1/cells world units, a star in a fraction dens of them
vec3 mb_stars(vec2 p, float cells, float dens, float gain) {
  vec3 r = hash32(floor(p * cells) + cells * 1.7);
  vec2 o = (fract(p * cells) - .15 - .7 * r.xy) / cells;
  float m = pow(fract(r.z * 23.7), 7.), s = gPix * (.75 + 1.1 * m);
  return step(r.z, dens) * gain * (.12 + m) * mb_starTint(fract(r.x * 9.1)) *
         (exp(-dot(o, o) / (s * s)) + .06 * m * exp(-length(o) / (6. * gPix)));
}
vec3 m_constellation(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc;
  vec2 nl = mb_nl(n);
  float inside = fill(d, gPix * 1.5);
  // a deep sky lit by a faint milky nebula; the subject is a dark cloud against it, rim-lit where the glow wraps its edge
  float neb = warp(p * 1.1 + vec2(3.1, 7.2), uTime * .004), dust = fbm3(p * 2.4 + 11.);
  vec3 nebC = mix(vec3(.10, .04, .11), vec3(.03, .08, .12), smoothstep(.35, .7, dust));
  vec3 sky = vec3(.007, .011, .024) + vec3(.012, .02, .04) * smoothstep(.25, .85, neb)
           + nebC * pow(smoothstep(.45, .95, neb), 1.4) * smoothstep(.2, .65, dust);
  sky += vec3(.02, .035, .07) * exp(-max(dl, 0.) / .05) + vec3(.03, .05, .09) * exp(-max(dl, 0.) / .008);
  vec3 col = mix(sky, vec3(.002, .003, .007) + nebC * .06 * neb, inside);
  float dn = mix(1., .12, inside);
  col += mb_stars(p, 55., .45 * dn, .4) + mb_stars(p + 3.7, 24., .32 * dn, .7) + mb_stars(p + 9.1, 10., .4 * dn, 1.3);
  // stars strung along the edge: each nearby cell's star is snapped onto the edge if it lies within half a cell of it
  float cs = uShape > .5 ? 38. : 30.;
  vec2 gi = floor(gLocal * cs);
  vec3 edge = vec3(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = gi + vec2(i, j);
    vec3 r = hash32(c + 71.3);
    vec2 s = (c + .1 + .8 * r.xy) / cs;
    float ds = dl + dot(nl, s - gLocal);
    s -= nl * (ds + (r.z - .5) * .3 / cs);   // onto the edge, give or take a little
    vec2 o = (s - gLocal) * sc;
    float m = .3 + .7 * pow(fract(r.z * 7.3), 3.), sz = gPix * (.8 + 1.1 * m);
    edge += step(abs(ds) * cs, .5) * m * mb_starTint(fract(r.z * 13.)) *
            (exp(-dot(o, o) / (sz * sz)) * 1.4 + .12 * m * exp(-length(o) / (4. * gPix)));
  }
  col += edge;
  // the faint chart line joining them
  col += vec3(.35, .48, .7) * .07 * stroke(d, gPix * .3, gPix * 1.5) * smoothstep(.35, .6, vnoise(gLocal * 30.));
  // holes: stars of every magnitude, the bright ones with diffraction spikes, all slowly twinkling (the lost burn red)
  if (h.on) {
    float hp = mb_hpx(), lost = mb_lost(h);
    float mag = .35 + .65 * pow(fract(h.seed * 37.1), 2.);
    float tw = .78 + .22 * sin(uTime * (.8 + 1.6 * h.seed) + h.seed * 60.);
    vec2 o = abs(h.o);
    float sw = max(hp * .6, .1), len = .5 + 1.4 * mag;
    float spk = exp(-o.y / sw - o.x / len) + exp(-o.x / sw - o.y / len);
    float star = exp(-h.r * h.r * 5.) * 1.6 + exp(-h.r * 2.2) * .3 + spk * .8 * mag;
    col += mix(vec3(.82, .9, 1.), vec3(1., .55, .38), lost) * star * mag * tw * smoothstep(2.5, 1.8, h.r) * mix(1., .6, lost);
  }
  col += vec3(.16, .24, .5) * .22 * h.dens * inside;
  return col;
}

// ================= 21 ink =================
vec3 m_ink(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal;
  bool pl = uShape > .5;
  // rice paper: warm and cloudy, with a few long pale fibres
  float tone = fbm3(lp * 2.2 + 1.7);
  vec3 paper = vec3(.75, .715, .64) * (.94 + .08 * tone + .03 * vnoise(lp * 24.));
  float g1 = gnoise(lp * vec2(7., 19.) + 3.), g2 = gnoise(lp * vec2(21., 6.) + 8.);
  float fib = sat(1. - abs(g1) / (fwidth(g1) * .9 + 1e-5)) * smoothstep(.62, .85, vnoise(lp * 5. + 2.))
            + sat(1. - abs(g2) / (fwidth(g2) * .9 + 1e-5)) * smoothstep(.62, .85, vnoise(lp * 5. + 9.));
  paper += vec3(.028, .028, .024) * fib;
  // the stroke: progress along the brush (it runs dry toward the end) and the coordinate across the bristles
  float prog, across;
  if (pl) {
    bool fus = gZone == 2;
    prog = fus ? (.66 - lp.y) / 1.32 : abs(lp.x) / (lp.y < -.36 ? .42 : 1.);
    across = fus ? lp.x : lp.y;
  } else {
    prog = .5 + mb_polar(p).y / 2.8;
    across = dl;
  }
  // the wash: a feathered edge from domain-warped noise, darker where the wet edge dried, a bloom's dark fringe inside
  float w = warp(lp * 2.2 + 4., 0.);
  float ed = dl + .028 * (w - .5) + .005 * (vnoise(lp * 140.) - .5);
  float cov = fill(ed, aa * 1.5), dep = max(-ed, 0.);
  float fringe = exp(-max(ed, 0.) / .0035) * (1. - cov) * (.25 + .75 * vnoise(lp * 320.));
  float load = mix(1.08, .6, sat(prog));   // the brush empties along the stroke
  float body = (.3 + .75 * smoothstep(.25, .78, w)) * load * (pl ? 1. : mix(1., .22, smoothstep(.02, .3, dep)));
  float dens = min(1., body + .45 * exp(-dep / .004) + .16 * exp(-abs(w - .6) / .02));
  // dry brush: bristle streaks open up toward the end of the stroke
  float bristle = vnoise(vec2(prog * 5., across * (pl ? 230. : 150.)));
  float dry = smoothstep(.45, .95, prog + .35 * (fbm3(vec2(prog * 3., across * 20.)) - .5));
  dens *= 1. - .9 * smoothstep(.35, .65, bristle) * dry;
  dens = max(dens * cov, fringe * .45);
  vec3 col = paper * mix(vec3(1.), vec3(.045, .05, .085), dens);
  // holes: splatters flicked from the brush, a pale bleed around each (the lost in vermilion)
  if (h.on) {
    float hp = mb_hpx();
    vec2 u = h.o / max(h.r, 1e-3);
    float R = .75 + .3 * vnoise(u * 1.8 + h.seed * 37.) + .1 * vnoise(u * 4.5 + h.seed * 11.);
    float blot = fill(h.r - R, hp * 1.5), bleed = fill(h.r - R - .28, hp * 1.5) * .3;
    for (int k = 0; k < 3; k++) {
      vec3 q = hash32(vec2(h.seed * 113. + float(k) * 7.3, float(k)));
      vec2 c = (1.3 + .95 * q.x) * vec2(cos(q.y * TAU), sin(q.y * TAU));
      blot = max(blot, fill(length(h.o - c) - (.05 + .15 * q.z), hp * 1.5));
    }
    // fresh ink stays glossy: a faint sheen lets a splatter show even on the darkest wash
    vec3 ink = mix(vec3(.03, .03, .05), vec3(.62, .13, .07), mb_lost(h)) + vec3(.09, .1, .12) * smoothstep(.2, -.8, dot(u, vec2(.6, -.8)) * h.r) * smoothstep(1., .2, h.r);
    float fade = smoothstep(2.5, 2.3, h.r);
    col = mix(col, col * mix(vec3(1.), ink * 3., .5), bleed * fade);
    col = mix(col, ink, blot * fade);
  }
  return col;
}

// ================= 22 xray =================
vec3 m_xray(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal;
  float inside = fill(dl, aa * 1.5), e = aa * 1.5;
  float lw = max(.0011, aa * .45);   // structural line half width
  float D = 0.;                      // absorbed dose: dense material shows bright
  if (uShape > .5) {
    vec2 a = vec2(abs(lp.x), lp.y);
    float fus = pl_fus(lp), nac = pl_nac(lp), wg = pl_wing(lp), tl = pl_tail(lp);
    float inF = fill(fus, e), inW = fill(wg, e), inT = fill(tl, e), inN = fill(nac, e);
    // skin, brighter where the ray grazes the round fuselage and nacelles
    D += .24 * inside + .4 * inF * exp(fus / .011) + .3 * inN * exp(nac / .007) + .07 * inF;
    // wing: two spars, stringers, ribs, the aileron and flap hinge line
    float le = .35 - .2577 * a.x, te = -.012 - .0105 * a.x, ch = le - te, cy = (le - a.y) / ch;
    D += inW * (.6 * (stroke(cy - .2, lw * 1.5 / ch, e / ch) + stroke(cy - .62, lw * 1.5 / ch, e / ch))
              + .26 * mb_lines(a.x / .045, aa / .045, .5) * step(.07, a.x)
              + .1 * mb_lines(cy * 9., aa / ch * 9., .35) + .3 * stroke(cy - .8, lw / ch, e / ch));
    // fuel tanks between the spars, either side of the inner engine
    float ym = le - .41 * ch, hh = .19 * ch;
    float tk = min(sdBox(vec2(a.x - .15, a.y - ym), vec2(.06, hh)), sdBox(vec2(a.x - .365, a.y - ym), vec2(.075, hh * .9))) - .004;
    D += inW * (.1 * fill(tk, e) + .16 * stroke(tk, lw, e));
    // tail: a spar, ribs and the elevator hinge
    float tle = -.405 - .3718 * a.x, tte = -.645 + .0769 * a.x, tcy = (tle - a.y) / (tle - tte);
    D += inT * (.5 * stroke(tcy - .3, lw * 1.4 / (tle - tte), e / (tle - tte)) + .22 * mb_lines(a.x / .04, aa / .04, .45)
              + .3 * stroke(tcy - .72, lw / (tle - tte), e / (tle - tte)));
    // fuselage: frames, stringers that follow its taper, the keel
    float hw = max(a.x - fus, .01);
    D += inF * (.24 * mb_lines(lp.y / .028, aa / .028, .5) + .22 * mb_lines(a.x / hw * 3., aa / hw * 3., .45));
    // cockpit panel, turrets, tail gun, the bomb load in the bay
    D += inF * .5 * stroke(lp.y - .5, lw * 1.6, e);
    float tt = length(lp - vec2(0., .425)), bt = length(lp - vec2(0., -.12));
    D += .8 * stroke(tt - .024, lw * 1.4, e) + .4 * fill(tt - .011, e) + .8 * stroke(bt - .03, lw * 1.4, e) + .4 * fill(bt - .013, e);
    D += .7 * stroke(sdBox(lp - vec2(0., -.628), vec2(.011, .018)), lw * 1.2, e);
    float row = clamp(floor((lp.y + .03) / .042 + .5), 0., 4.);
    D += .75 * fill(sdBox(vec2(a.x - .021, lp.y + .03 - row * .042), vec2(.003, .012)) - .005, e);
    // engines: radial cylinders round a bright crankcase; main wheels behind the inner pair; propellers edge-on
    for (int i = 0; i < 4; i++) {
      vec2 q = (lp - ENGINE_FRONT[i] + vec2(0., .036)) / vec2(.036, .024);
      float r = length(q), cyl = pow(.5 + .5 * cos(atan(q.y, q.x) * 9.), 1.5);
      D += 1.1 * fill(r - (.55 + .45 * cyl), e / .03) * (.75 + .25 * cos(r * 30.)) + 1.7 * exp(-r * r * 9.);
    }
    vec2 wq = vec2(a.x - .245, lp.y - .215);
    D += .7 * fill(sdBox(wq, vec2(.009, .03)) - .004, e) + .5 * stroke(wq.x, lw, e) * step(abs(wq.y), .03);
    D += 1.4 * stroke(planeProps(lp), .0024, e);
  } else {
    // the arc: a bright cortex, spongy struts beneath it, then internal growth rings over a darker core
    vec2 pol = mb_polar(p);
    float dep = max(-dl, 0.), wob = fbm3(vec2(pol.y * 2.5, 1.3));
    D += inside * (.34 + 1.1 * exp(-dep / .008) + .25 * exp(-dep / .05) - .12 * smoothstep(.15, .35, dep));
    vec2 vp = vec2(pol.y, dep * 1.5) * 24.;
    vec3 v = voronoi(vp + .5 * vec2(vnoise(vp * .5), vnoise(vp * .5 + 5.)));
    D += inside * .5 * stroke(v.y, .05 + .05 * v.z, aa * 24. * 1.5) * smoothstep(.01, .025, dep) * smoothstep(.12, .05, dep);
    for (int k = 0; k < 5; k++) {
      float rk = .13 + float(k) * .048 + .02 * (wob - .5) * float(k + 1);
      D += inside * (.22 + .2 * fract(float(k) * .618)) * exp(-pow((dep - rk) / (.003 + .002 * float(k & 1)), 2.));
    }
  }
  // holes: the missing skin reads a little darker; a bullet fragment lodged nearby is brilliant white
  if (h.on) {
    float hp = mb_hpx();
    D -= .12 * fill(h.r - .95, hp * 1.5) * inside;
    D += .12 * stroke(h.r - .95, hp * .6, hp * 1.5) * inside;
    vec2 c = (hash22(vec2(h.seed * 57., 1.)) - .5) * 1.2, u = h.o - c;
    float frag = fill(length(u * vec2(1., 1.35)) - (.18 + .16 * fract(h.seed * 7.) + .12 * vnoise(u * 5. + h.seed * 30.)), hp * 1.5);
    for (int k = 0; k < 2; k++) {
      vec3 q = hash32(vec2(h.seed * 71. + float(k), 9.));
      vec2 c2 = c + (.4 + .9 * q.x) * vec2(cos(q.y * TAU), sin(q.y * TAU));
      frag = max(frag, step(.4, q.z) * fill(length(h.o - c2) - (.04 + .08 * q.z), hp * 1.5));
    }
    D += 5. * frag * smoothstep(2.5, 2.2, h.r);
  }
  float b = 1. - exp(-max(D, 0.) * 1.4);
  return vec3(.012, .022, .042) + vec3(.42, .56, .7) * b + vec3(.5, .45, .32) * pow(b, 4.);
}

// ================= 23 sun =================
vec3 m_sun(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal, nl = mb_nl(n);
  bool pl = uShape > .5;
  float inside = fill(dl, aa * 1.5);
  // limb darkening on a sphere of radius R (a small one for the plane)
  float R = pl ? .09 : 1.3;
  float x = sat(1. - max(-dl, 0.) / R), mu = sqrt(max(1. - x * x, 0.));
  // granulation: bright cells between dark lanes, foreshortened toward the limb and slowly boiling
  vec2 gp = pl ? lp * 75. : vec2(mb_polar(p).y, R * acos(x)) * 85.;
  float t = uTime * .05;
  gp += .4 * vec2(vnoise(gp * .23 + t), vnoise(gp * .23 + 7.3 - t));
  vec3 v = voronoi(gp);
  float gran = (.8 + .28 * smoothstep(0., .22, v.y) - .12 * v.x * v.x) * (.94 + .12 * v.z);
  gran = mix(1., gran, .3 + .7 * mu);
  float big = fbm3(gp * .05 + 2.);   // supergranulation, and faculae bright toward the limb
  float I = (1. - .45 * (1. - mu) - .15 * (1. - mu * mu)) * (.92 + .16 * big) * (1. + smoothstep(.55, .8, big) * (1. - mu) * .5);
  vec3 photo = mix(vec3(.62, .17, .02), vec3(1., .66, .26), pow(mu, .6)) * I * gran;
  // sunspots: a dark umbra in a warm, filamentary penumbra, ringed by a faint bright plage
  if (h.on) {
    vec2 u = h.o / max(h.r, 1e-3);
    float r = h.r * (1. + .16 * (vnoise(u * 2.2 + h.seed * 40.) - .5));
    float umb = smoothstep(.52, .38, r), pen = smoothstep(1.3, 1., r) * (1. - umb);
    float fil = .6 * vnoise(u * 9. + h.seed * 13.) + .4 * vnoise(u * 21. + h.seed * 5.);
    photo *= mix(1., .42 + .38 * fil, pen) * (1. + .14 * smoothstep(1.2, 1.6, r) * smoothstep(2.5, 1.8, r));
    photo = mix(photo, vec3(.06, .014, .002), umb);
  }
  // chromosphere and spicules above the limb, black space beyond
  float o = max(dl, 0.), s = mb_along(p, nl);
  float spic = vnoise(vec2(s * (pl ? 260. : 180.), o * 35.));
  vec3 chrom = vec3(1., .2, .05) * exp(-o / .004) * (.55 + .6 * spic) + vec3(1., .35, .1) * exp(-o / .03) * .1;
  return mix(vec3(.003, .003, .005) + chrom, photo, inside);
}

// ================= 24 topo =================
float mb_tri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r; p.y += r / k;
  if (p.x + k * p.y > 0.) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.;
  p.x -= clamp(p.x, -2. * r, 0.);
  return -length(p) * sign(p.y);
}
vec3 m_topo(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal;
  bool pl = uShape > .5;
  float land = max(-dl, 0.), sea = max(dl, 0.);
  // height, in contour intervals: the shore rises into rolling hills; every hole is a small peak
  float hills = fbm(lp * (pl ? 4.5 : 2.) + 3.1);
  float H = 6. * (1. - exp(-land * (pl ? 40. : 9.))) + 7. * hills * smoothstep(0., pl ? .04 : .12, land);
  if (h.on) H += 1.1 * max(2.3 - h.r, 0.);
  float fw = fwidth(H);
  float cont = mb_lines(H, fw, .4) * step(.5, H), idx = mb_lines(H / 5., fw / 5., .9) * step(2.5, H);
  // relief shading, lit from the north-west
  vec3 N = normalize(vec3(-dFdx(H), -dFdy(H), .5));
  float shade = dot(N, normalize(vec3(-1., 1., 1.3))) - .6;
  // water lines spreading from the shore
  float wl = sqrt(sea / (pl ? .0012 : .0035));
  float water = mb_lines(wl, fwidth(wl), .4) * step(.6, wl) * smoothstep(9., 5., wl);
  vec3 col = vec3(.78, .75, .66) * (.95 + .08 * fbm3(p * 3. + 5.));
  float seaM = fill(-dl, aa * 1.5);
  col = mix(col, mix(vec3(.64, .74, .79), vec3(.56, .67, .75), smoothstep(0., .3, sea)), seaM * .8);
  col *= 1. + (1. - seaM) * .45 * clamp(shade, -.5, .3);
  float wood = smoothstep(.56, .7, fbm3(lp * 6. + 2.)) * smoothstep(.03, .08, land);
  col = mix(col, col * vec3(.88, .96, .8), wood * .6);
  col = mix(col, vec3(.3, .48, .62), water * .6);
  col = mix(col, vec3(.52, .32, .16), cont * .65);
  col = mix(col, vec3(.42, .22, .1), idx * .85);
  col = mix(col, vec3(.2, .13, .07), stroke(dl, aa * .8, aa * 1.5));
  col = mix(col, vec3(.3, .28, .25), .25 * max(mb_lines(p.x / .25, gPix / .25, .35), mb_lines(p.y / .25, gPix / .25, .35)));
  if (h.on) col = mix(col, vec3(.3, .16, .08), fill(mb_tri(h.o, .32), mb_hpx() * 1.5) * smoothstep(2.5, 2.2, h.r));
  return col;
}

// ================= 25 kintsugi =================
vec3 m_kintsugi(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal, nl = mb_nl(n), sq = mb_scr(p);
  bool pl = uShape > .5;
  float inside = fill(dl, aa * 1.5), dep = max(-dl, 0.);
  // charcoal glaze: uneven and satin, fine rust streaks running down from the rim, iron speckles
  float g = fbm(lp * 3.2 + 2.);
  vec3 col = vec3(.06, .056, .053) * (.72 + .56 * g);
  float fur = vnoise(vec2(mb_along(p, nl) * (pl ? 260. : 130.), dep * 5.));
  col = mix(col, vec3(.16, .08, .04), smoothstep(.62, .9, fur) * exp(-dep / (pl ? .03 : .09)) * .6);
  vec2 sp = lp * 190.;
  vec3 sr = hash32(floor(sp));
  vec2 so = fract(sp) - .5 - .4 * (sr.xy - .5);
  col += vec3(.16, .12, .09) * step(.94, sr.z) * exp(-dot(so, so) * 30.);
  col *= .85 + .35 * smoothstep(-.6, .6, dot(sq, vec2(-.6, .8)));
  // the lip: the glaze breaks to the warm clay body at the very edge
  col = mix(col, vec3(.3, .19, .12), smoothstep(-.012 * (.6 + .8 * vnoise(lp * 30.)), 0., dl));
  col += vec3(.25, .2, .16) * exp(dl / .0015) * sat(dot(nl, vec2(-.4, .9)));
  // the break lines (a gentle warp only: stronger warps fold the cells)
  float fs = pl ? 4.2 : 2.4;
  vec2 cp = lp * fs;
  cp += .12 * vec2(gnoise(cp * .9 + 3.), gnoise(cp * .9 + 9.));
  vec3 v = voronoi(cp);
  float by = v.y + .006 * (vnoise(cp * 26.) - .5);
  float sw = .015 + .012 * vnoise(cp * 3.), px = aa * fs;
  float seam = sat(.5 - (by - sw) / (px * 1.5));
  vec3 v2 = voronoi(cp * 3.1 + 17.);   // faint crazing in the glaze
  col *= 1. - .3 * sat(.5 - (v2.y - .005) / (px * 3.1 * 1.5)) * step(.5, v2.z);
  // gold: a raised lacquer bead with a metallic sheen and a sparkle of powder
  vec2 gd = vec2(dFdx(by), dFdy(by));
  gd /= max(length(gd), 1e-6);
  float tb = sat(by / max(sw, 1e-4));
  vec3 N = normalize(vec3(gd * tb * 1.3, sqrt(max(1. - tb * tb, 0.)) + .25));
  float gl = hash21(floor(lp * 350.));
  vec3 gold = mb_gold(N, sq, .15) + vec3(1., .9, .7) * step(.97, gl) * (.5 + .5 * sin(uTime * 1.3 + gl * 90.)) * .6;
  col = mix(col, gold, seam);
  // holes: flush gold repairs, hairline cracks radiating from each (the lost are left broken)
  if (h.on) {
    float hp = mb_hpx(), lost = mb_lost(h);
    vec2 u = h.o / max(h.r, 1e-3);
    float rr = h.r / (1. + .14 * (vnoise(u * 2.5 + h.seed * 30.) - .5));
    float cd = 9.;
    for (int k = 0; k < 4; k++) {
      vec3 q = hash32(vec2(h.seed * 83. + float(k) * 5.1, 2.));
      vec2 dir = vec2(cos(q.x * TAU), sin(q.x * TAU));
      float al = dot(h.o, dir), len = 1.5 + .9 * q.y;
      cd = min(cd, abs(dot(h.o, vec2(-dir.y, dir.x)) + .06 * sin(al * 6. + q.z * 9.)) - .06 * sat(1. - (al - 1.) / (len - 1.)) - .015
                   + 9. * step(len, al) + 9. * step(al, .8));
    }
    float fade = smoothstep(2.5, 2.2, h.r);
    col = mix(col, mix(mb_gold(vec3(0., 0., 1.), sq, .25), vec3(.012), lost), fill(cd, hp * 1.5) * fade);
    vec3 gh = mb_gold(normalize(vec3(u * .9 * smoothstep(.65, 1., rr), 1.)), sq, .35) * (.9 + .2 * hash21(floor(h.o * 5. + h.seed * 50.)));
    col = mix(col, mix(gh, vec3(.008), lost), fill(rr - 1., hp * 1.5) * fade);
  }
  vec3 bg = vec3(.013, .012, .011) * (1. + .5 * smoothstep(.5, -.5, sq.y)) * mix(.4, 1., smoothstep(0., .05, dl));
  return mix(bg, col, inside);
}

// ================= 26 record =================
vec3 m_record(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 nl = mb_nl(n), sq = mb_scr(p);
  bool pl = uShape > .5;
  float inside = fill(dl, aa * 1.5), dep = max(-dl, 0.);
  // two lights; they drift slowly, as if the record turns
  float th = .14 * sin(uTime * .09) - .07;
  vec2 L = vec2(sin(th), cos(th)), L2 = vec2(sin(th + .42), cos(th + .42));
  // grooves below a smooth lead-in, quiet gaps between the tracks; pits make the grooves swerve
  float pitch = pl ? .0022 : .003, gv = dep / pitch;
  if (h.on) gv += 2.5 * exp(-h.r * h.r * .6) * smoothstep(2.5, 2., h.r);
  float gr = cos(gv * TAU) * sat(1.8 - aa / pitch * 2.5);
  float lead = pl ? .01 : .03, tw = pl ? .05 : .085;
  float tr = (dep - lead) / tw;
  tr += .15 * sin(tr * 2.1 + 1.);
  float f = fract(tr), tfw = aa / tw * 1.5;
  float land = max(1. - smoothstep(lead - aa, lead + aa, dep), smoothstep(.07 + tfw, .07, f) * smoothstep(0., tfw, f));
  float grooved = 1. - land;
  // loud passages cut wider grooves, so the sheen changes ring by ring
  float mus = .45 + .55 * vnoise(vec2(dep * (pl ? 400. : 230.), 3.));
  // the sheen: grooves light up where they run across the light, a hint of diffraction colour at its flanks
  float al = abs(dot(nl, L)), al2 = abs(dot(nl, L2)), K = pl ? 40. : 260.;
  float band = pow(al, K) + .45 * pow(al2, K * .5), broad = pow(al, K * .03);
  vec3 sheen = vec3(.9, .91, .94) * (grooved * mus * (.5 + .5 * gr) + land * .1);
  sheen *= 1. + .1 * cos(TAU * (dot(nl, vec2(L.y, -L.x)) * (pl ? 3. : 9.) + vec3(0., .33, .67))) * grooved;
  vec3 col = vec3(.013, .013, .015) + band * sheen + broad * vec3(.07) * (grooved * mus * (.5 + .5 * gr) + land * .35);
  col += vec3(.02) * gr * grooved * (.5 + .5 * mus);
  // the rim: a rounded lip catching the light along its crest
  col += vec3(.5, .49, .48) * exp(-pow((dep - .0022) / .0014, 2.)) * pow(max(dot(nl, normalize(vec2(-.25, 1.))), 0.), 2.);
  // holes: pits pressed into the vinyl
  if (h.on) {
    float hp = mb_hpx();
    vec2 u = h.o / max(h.r, 1e-3);
    float wall = smoothstep(.35, .85, h.r) * max(dot(u, -L), 0.);
    col = mix(col, vec3(.003) + vec3(.35) * wall, fill(h.r - .85, hp * 1.5));
    col += vec3(.3) * exp(-pow((h.r - 1.) / .15, 2.)) * max(dot(u, L), 0.) * smoothstep(2.5, 2., h.r);
  }
  // the dark room, a soft pool of light behind the subject, out-of-focus dust drifting in the light
  vec3 room = vec3(.016, .014, .013) * (.6 + .6 * smoothstep(-.5, .4, sq.y)) + vec3(.03, .027, .024) * exp(-max(dl, 0.) / .25) * (pl ? 1. : .3);
  vec2 mp = p * 7. + vec2(uTime * .01, -uTime * .006);
  vec3 mr = hash32(floor(mp));
  float mo = length((fract(mp) - .2 - .6 * mr.xy) / 7.) / (gPix * (2. + 3. * mr.x));
  room += vec3(.05, .045, .04) * step(.85, mr.z) * smoothstep(1., .7, mo);
  return mix(room, col, inside);
}

// ================= 27 treerings =================
vec3 m_treerings(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 nl = mb_nl(n), lp = gLocal;
  bool pl = uShape > .5;
  float k = pl ? 2.4 : 1.;           // the plane's features are smaller
  float s = mb_along(p, nl);
  // a ragged bark edge
  float ed = dl + .006 / k * (vnoise(vec2(s * 55. * k, 1.)) - .5) + .003 / k * (vnoise(vec2(s * 160. * k, 4.)) - .5);
  float inside = fill(ed, aa * 1.5), dep = max(-ed, 0.), bw = .03 / k;
  float bn = fbm3(vec2(s * 22. * k, dep * 45. * k));
  float bd = dep + (bn - .5) * .014 / k;   // the bark's inner boundary wanders
  // rings: uneven widths (wet years and dry), gently wandering, flowing around knots
  float F = 58. * k, u = max(-dl - bw, 0.) * F;   // from the true edge: the rings don't copy the bark's raggedness
  u += 2. * vnoise(vec2(u * .17, 7.)) + .3 * vnoise(vec2(u * .8, 2.)) + 1.2 * (vnoise(vec2(s * .7 * k, u * .02)) - .5);
  if (h.on) u -= 2.2 * exp(-h.r * h.r * .35) * smoothstep(2.5, 2., h.r);
  float f = fract(u), fw = aa * F * 1.3;
  float late = mix(smoothstep(.6, .94, f) * sat((1. - f) / max(fw, 1e-4)), .22, smoothstep(.25, .5, fw));
  float heart = smoothstep(.07 / k, .12 / k, dep + .012 / k * (vnoise(vec2(s * 4. * k, 2.)) - .5));
  vec3 wood = mix(mix(vec3(.8, .67, .5), vec3(.64, .44, .29), heart), mix(vec3(.58, .41, .26), vec3(.4, .23, .13), heart), late);
  // pores, the faint arcs the saw left, and rays across the rings
  wood *= (.95 + .08 * vnoise(vec2(s, dep) * 240. * k)) * (.97 + .05 * sin(length(lp - vec2(-2.2, 3.1)) * (pl ? 420. : 180.)));
  float rs = s * 120. * k, ri = floor(rs);
  vec3 rh = hash32(vec2(ri, 5.));
  float rx = (fract(rs) - .5 - .6 * (rh.x - .5)) / (120. * k);
  wood *= 1. + .12 * sat(1. - abs(rx) / (aa * .8)) * step(rh.y, .6) * smoothstep(rh.z * .2, rh.z * .2 + .02, dep);
  // checks: V-shaped cracks running in from the bark
  float cs = s * 2.6 * k, ci = floor(cs);
  vec3 ch = hash32(vec2(ci, 11.));
  float cx = (fract(cs) - .5 - .7 * (ch.x - .5)) / (2.6 * k) + .003 / k * gnoise(vec2(dep * 40. * k, ci));
  float cw = .005 / k * pow(sat(1. - dep / ((.05 + .22 * ch.y) / k)), 1.5), has = step(ch.z, .6);
  wood *= 1. - .25 * has * exp(-abs(cx) / (cw + aa * 2.));
  wood = mix(wood, vec3(.08, .045, .025), has * fill(abs(cx) - cw, aa * 1.5));
  // bark: fissured plates, redder inner bark, the pale cambium line
  vec3 bark = mix(vec3(.1, .07, .05), vec3(.32, .22, .15), smoothstep(.25, .8, bn)) * (.6 + .4 * vnoise(vec2(s * 70. * k, dep * 15. * k)));
  bark = mix(bark, vec3(.5, .3, .18), smoothstep(bw * .55, bw, bd) * .55);
  wood = mix(wood, vec3(.9, .78, .55), exp(-abs(bd - bw) / (.0018 / k)) * .45);
  vec3 col = mix(wood, bark, 1. - smoothstep(bw - aa, bw + aa, bd));
  // holes: knots the rings flow around (the lost: wormholes)
  if (h.on) {
    float hp = mb_hpx(), lost = mb_lost(h);
    vec2 uu = h.o / max(h.r, 1e-3);
    float r = h.r * (1. + .1 * (vnoise(uu * 2. + h.seed * 20.) - .5));
    vec3 knot = mix(vec3(.22, .11, .05), vec3(.38, .2, .09), .5 + .5 * cos(r * 18.)) * (.7 + .3 * r);
    knot = mix(knot, vec3(.12, .06, .03), smoothstep(.75, .95, r));
    vec3 worm = mix(mix(col, vec3(.75, .62, .45), exp(-pow((r - .72) / .16, 2.)) * .6), vec3(.01), fill(r - .55, hp * 1.5));
    col = mix(mix(col, knot, fill(r - .95, hp * 1.5)), worm, lost);
  }
  // the dark forest floor: leaf litter and moss, in the trunk's shadow
  vec3 v = voronoi(p * 11. + 3.);
  vec3 fl = mix(vec3(.022, .018, .012), vec3(.05, .037, .022), v.z * smoothstep(.0, .25, v.y));
  fl = mix(fl, vec3(.02, .032, .013), smoothstep(.45, .75, fbm3(p * 5. + 8.)) * .7);
  fl *= (.8 + .4 * vnoise(p * 60.)) * mix(.3, 1., smoothstep(0., .06, dl));
  return mix(fl, col, inside);
}

// ================= 28 stone =================
vec3 m_stone(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 lp = gLocal, nl = mb_nl(n);
  bool pl = uShape > .5;
  float inside = fill(dl, aa * 1.5);
  vec2 L = normalize(vec2(-.55, .85));      // light from the upper left
  float sp = pl ? .0105 : .0072;            // hatch spacing (local units)
  float wea = fbm(lp * (pl ? 7. : 4.5) + 4.);
  float T, hv, hv2, joint, stone;
  vec2 bid;
  if (!pl) {
    // the arch: a ring of voussoirs on radial joints, a proud keystone at the crown, the dark opening beneath
    vec2 pol = mb_polar(p);
    float s = pol.y, dep = -dl, vb = .1, kw = .055, vw = .078;
    bool key = abs(s) < kw;
    float as = abs(s) - kw, si = floor(as / vw), sf = fract(as / vw);
    float bx = key ? (s + kw) / (2. * kw) : (s > 0. ? sf : 1. - sf);
    float top = key ? -.012 : 0., bot = key ? vb + .012 : vb;
    float by = (dep - top) / (bot - top), bwid = key ? 2. * kw : vw, bht = bot - top;
    bid = vec2(key ? 0. : (si + 1.) * sign(s), 1.);
    stone = fill(top - dep, aa * 1.5) * fill(dep - bot, aa * 1.5);
    joint = fill(min(min(bx, 1. - bx) * bwid, min(by, 1. - by) * bht) - .0011, aa * 1.5) * stone;
    // each stone a cushion: its upper left edges lit, its lower right in shadow
    vec2 t = vec2(nl.y, -nl.x), e2 = vec2(bx - .5, .5 - by);
    vec2 ew = smoothstep(.3, .5, abs(e2)) * sign(e2);
    T = .24 + .16 * hash21(bid + 3.) + .3 * smoothstep(.5, .78, wea) - .32 * dot(ew.x * t + ew.y * nl, L);
    // the opening: deep shadow, easing a little where light comes through from the far side
    float open = fill(bot - dep, aa * 1.5) * (1. - stone);
    T = mix(T, 1. - .25 * smoothstep(.14, .45, dep), open);
    hv = key || open > .5 ? dep / sp : s / sp;
    hv2 = key || open > .5 ? s / sp : dep / sp;
    stone = max(stone, open);
  } else {
    // the plane: carved in relief across a wall of ashlar blocks, its bevel lit from the upper left, its shadow cast down and right
    float rowH = .075, colW = .17, ri = floor(lp.y / rowH), rf = fract(lp.y / rowH);
    float cx = lp.x / colW + .5 * mod(ri, 2.), cf = fract(cx);
    bid = vec2(floor(cx), ri);
    joint = fill(min(min(rf, 1. - rf) * rowH, min(cf, 1. - cf) * colW) - .001, aa * 1.5) * (1. - .5 * inside);
    float face = dot(nl, L), ramp = sat(1. + dl / .014);
    T = .14 + .08 * hash21(bid) + .28 * smoothstep(.5, .78, wea);
    T += inside * ramp * (.3 - .5 * face);
    T += (1. - inside) * .55 * (1. - smoothstep(.018 * max(-face, 0.) * .8, .018 * max(-face, 0.), dl)) * step(face, 0.);
    hv = inside > .5 ? (ramp > .01 ? dl / sp : dot(lp, vec2(.7071)) / sp) : lp.y / sp;
    hv2 = inside > .5 ? dot(lp, vec2(.7071, -.7071)) / sp : lp.x / sp;
    stone = 1.;
  }
  // stipple: the engraver's dots for weathered stone
  vec2 sg = lp / (sp * 1.3);
  vec3 sr = hash32(floor(sg) + 7.);
  float stip = step(sr.z, .08 + .3 * smoothstep(.45, .8, wea)) * fill(length(fract(sg) - .5 - .5 * (sr.xy - .5)) * sp * 1.3 - aa * .6, aa * 1.2);
  // holes: chips knocked out of the stone
  float rim = 0.;
  if (h.on) {
    float hp = mb_hpx();
    vec2 u = h.o / max(h.r, 1e-3);
    float rr = h.r / (.8 + .35 * vnoise(u * 2.3 + h.seed * 17.));
    T = mix(T, .3 + .55 * sat(dot(u, L) * 1.4 + .2), fill(rr - 1., hp * 1.5));
    rim = stroke(rr - 1., hp * .45, hp * 1.5) * smoothstep(2.5, 2.2, h.r);
  }
  float fw = aa / sp;
  float stoneInk = max(mb_engrave(hv, fw, sat(T)), mb_engrave(hv2, fw, sat(T * 2. - 1.1)));
  stoneInk = max(stoneInk, stip * stone);
  // the sky: sparse horizontal lines, lighter toward the horizon, parted in a white halo around the subject
  float sky = mb_engrave(p.y / .014 + .2 * sin(p.x * 4. + p.y * 7.), gPix / .014,
                         (.2 * smoothstep(.02, .5, p.y) + .12 * smoothstep(.55, .8, fbm3(p * vec2(1.2, 3.) + 2.))) * smoothstep(.01, .06, dl));
  float ink = mix(sky, stoneInk, stone);
  ink = max(ink, max(joint, rim));
  ink = max(ink, stroke(dl, aa * .6, aa * 1.5) * (pl ? 1. : 1. - step(abs(mb_polar(p).y), .055)));
  return mix(vec3(.72, .69, .62), vec3(.1, .09, .08), ink);
}

// ================= 29 coin =================
vec3 m_coin(vec2 p, float d, vec2 n, Hole h) {
  float sc = mb_sc(), dl = d / sc, aa = gPix / sc;
  vec2 nl = mb_nl(n), sq = mb_scr(p), t = vec2(nl.y, -nl.x);
  bool pl = uShape > .5;
  float inside = fill(dl, aa * 1.5), dep = max(-dl, 0.);
  vec2 tilt = vec2(0.);
  float matte = 0., ao = 1.;
  if (!pl) {
    float s = mb_polar(p).y;
    // a rounded outer edge, then the reeded rim: fine radial ridges
    tilt += nl * 1.8 * pow(sat(1. - dep / .006), 1.5);
    float rimB = smoothstep(.006, .007, dep) * smoothstep(.047, .045, dep);
    tilt += t * .55 * sin(s / .0065 * TAU) * sat(1.6 - aa / .0065 * 2.4) * rimB;
    tilt -= nl * .9 * exp(-pow((dep - .049) / .0022, 2.));
    // the raised beaded border
    float bi = floor(s / .02 + .5);
    vec2 bo = vec2(s - bi * .02, dep - .062);
    float bl = length(bo) / .0068, bead = fill(bl - 1., aa * 1.5 / .0068);
    tilt += (bo.x * t - bo.y * nl) / .0068 * 1.1 * bead;
    matte += .5 * bead;
    ao *= 1. - .35 * exp(-pow((bl - 1.1) / .25, 2.));
    // a ring of small raised stars, frosted, their edges bevelled
    float si = floor(s / .105 + .5);
    vec2 so = vec2(s - si * .105, .1 - dep);
    float st = sdStar5(so, .012, .45);
    vec2 sg = vec2(sdStar5(so + vec2(.0008, 0.), .012, .45) - st, sdStar5(so + vec2(0., .0008), .012, .45) - st) / .0008;
    float sin_ = fill(st, aa * 1.5);
    tilt += (sg.x * t + sg.y * nl) * 1.2 * sin_ * smoothstep(-.0025, 0., st);
    matte += .6 * sin_;
    ao *= 1. - .3 * stroke(st, aa, aa * 1.5);
  } else {
    // the plane in gold relief: the edge rolls over, a wire border runs just inside it
    tilt += nl * 1.5 * pow(sat(1. - dep / .018), 2.);
    float wd = dep - .022;
    tilt += nl * (-2. * wd / .000009) * exp(-wd * wd / .000009) * .0035;
  }
  // holes: punched dents with a raised burr
  if (h.on) {
    vec2 u = h.o / max(h.r, 1e-3);
    float r = h.r, g = r < 1. ? -.9 * r : 0., bb = (r - 1.15) / .14;
    g += 2. * bb / .14 * .12 * exp(-bb * bb) * .6;
    tilt += u * g * smoothstep(2.5, 2.1, r);
    ao *= mix(1., .75, fill(r - 1., mb_hpx() * 1.5));
  }
  vec3 col = mb_gold(normalize(vec3(tilt, 1.)), sq, matte) * ao;
  // dark velvet in soft folds, its pile catching the light where it turns away
  float fv = fbm3(p * .9 + 7.);
  float sl = length(vec2(dFdx(fv), dFdy(fv))) / gPix;
  vec3 vel = vec3(.045, .006, .013) * (.6 + .7 * fv) + vec3(.16, .025, .05) * smoothstep(.1, 1.2, sl) * .5;
  vel *= mix(.3, 1., smoothstep(0., .03, dl));
  return mix(vel, col, inside);
}
`;
  [[20, "constellation", "light"], [21, "ink", "dark"], [22, "xray", "light"], [23, "sun", "light"], [24, "topo", "dark"],
   [25, "kintsugi", "light"], [26, "record", "light"], [27, "treerings", "light"], [28, "stone", "dark"], [29, "coin", "light"]]
    .forEach(([id, name, ink]) => H.mediaDefs.push({ id, name, ink, fn: "m_" + name, glsl }));
})();
