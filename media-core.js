// Core medium: the thermal camera. This is the film's honest data view: its heat is the density of holes,
// splatted by the engine (Hole.dens = planes that came home, Hole.densLost = planes that didn't).
// A medium is a GLSL function  vec3 m_<name>(vec2 p, float d, vec2 n, Hole h)
//   p: world position, d: signed distance to the subject (negative inside), n: outward normal,
//   h: the bullet hole under this pixel (see Hole in glsl-common.js). Globals: gLocal, gZone, gSide, gPix, uTime, uFX, uFX2.
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.mediaDefs = H.mediaDefs || [];
  const glsl = /* glsl */ `
vec3 ironbow(float t) {
  t = sat(t);
  vec3 c = mix(vec3(.02, .01, .06), vec3(.11, .04, .29), sat(t / .15));
  c = mix(c, vec3(.35, .05, .48), sat((t - .15) / .15));
  c = mix(c, vec3(.64, .07, .48), sat((t - .30) / .15));
  c = mix(c, vec3(.88, .25, .18), sat((t - .45) / .15));
  c = mix(c, vec3(.97, .60, .11), sat((t - .60) / .15));
  c = mix(c, vec3(.99, .89, .42), sat((t - .75) / .15));
  return mix(c, vec3(1., .98, .91), sat((t - .90) / .10));
}
vec3 m_thermal(vec2 p, float d, vec2 n, Hole h) {
  float inside = fill(d, gPix * 1.5);
  float T;
  if (uShape < .5) {
    // the arc: a warm body with slow convection
    T = mix(.08 + .06 * exp(-max(d, 0.) * 6.), .42 + .38 * fbm(vec2(p.x * 3., p.y * 1.4 - uTime * .15)), inside);
  } else {
    // the plane: skin a little warmer than the sky, then the holes' heat
    float heat = uFX.x * (h.dens + uFX.y * h.densLost);
    float Tin = .17 + .06 * exp(d * 40.) + heat;
    // the pattern, resolved: each part filled by the share of planes hit there
    // (uP[0] came home, uP[1] lost: engines, wings and tail, fuselage), blended in by uP[2].x / uP[2].y
    bool lostSide = gSide > .5;
    float zm = lostSide ? uP[2].y : uP[2].x;
    if (zm > 0. && gZone >= 0) {
      vec4 v = lostSide ? uP[1] : uP[0];
      float share = gZone == 0 ? v.x : gZone == 1 ? v.y : v.z;
      float Tz = .12 + .8 * share + .03 * (fbm(gLocal * 5. + uTime * .08) - .5);
      Tin = mix(Tin, Tz, zm);
    }
    if (h.on) Tin += (.25 + .15 * zm) * sat(1. - h.r);
    T = mix(.07 + .05 * exp(-max(d, 0.) * 30.), Tin, inside);
    if (zm > 0. && gZone >= 0) T -= .22 * zm * inside * (1. - smoothstep(0., 2.5 * gPix, abs(zoneD(gLocal, gZone)) * uPlane.z));   // seams between the parts
  }
  T += .012 * (hash21(floor(p / gPix / 2.) + floor(uTime * 12.)) - .5);           // sensor noise
  vec3 col = ironbow(T);
  float iso = abs(fract(T * 8.) - .5);                                            // faint isotherms
  col = mix(col, col * 1.25 + .03, inside * smoothstep(.06, .0, iso) * .35 * sat(T * 3. - .6));
  col *= .96 + .04 * sin(gl_FragCoord.y * 1.7);                                   // scan lines
  return col;
}
`;
  H.mediaDefs.push({ id: 1, name: "thermal", ink: "light", fn: "m_thermal", glsl });
})();
