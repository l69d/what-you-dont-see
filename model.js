// The data behind the film: a B-17 in plan view, and 300 simulated sorties.
// Pure functions only. Loaded as a classic <script> (window.HOLES.model) and by node tests (module.exports).
(function (root) {
  const M = {};

  // ---------- geometry: plan view, wingspan = 2 units, nose toward +y ----------
  // (B-17: span 31.6 m, length 22.7 m.) The same numbers are injected into the GLSL plane SDF.
  const G = M.GEO = {
    WING: [[0, .335], [.955, .088], [.955, -.022], [0, -.012]], WING_R: .02,
    TAIL: [[0, -.405], [.39, -.55], [.39, -.615], [0, -.645]], TAIL_R: .015,
    FUS: [[0, .655, .052, 0, .46, .073], [0, .46, .073, 0, -.05, .071], [0, -.05, .071, 0, -.66, .026]],
    NAC: [[.245, .042], [.49, .037]],   // nacelle x, radius (mirrored)
    LE0: .35, LEK: .2577,               // wing leading edge: y = LE0 - LEK * x
    NAC_F: .1, NAC_B: .21,              // nacelle reaches this far ahead of / behind the leading edge
    HOLE_R: .0105,                      // drawn radius of a bullet hole
  };
  const lerp = (a, b, t) => a + (b - a) * t, clamp01 = t => Math.max(0, Math.min(1, t));
  const LE = x => G.LE0 - G.LEK * x;
  M.LE = LE;

  function sdPoly(px, py, v) {
    let d = Infinity, s = 1;
    for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
      const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = px - v[i][0], wy = py - v[i][1];
      const h = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey));
      const bx = wx - ex * h, by = wy - ey * h;
      d = Math.min(d, bx * bx + by * by);
      const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  }
  // capsule along a segment whose radius changes linearly from ra to rb
  function sdCap(px, py, ax, ay, ra, bx, by, rb) {
    const dx = bx - ax, dy = by - ay, t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t) - lerp(ra, rb, t);
  }
  const fus = (x, y) => Math.min(...G.FUS.map(c => sdCap(x, y, ...c)));
  const nac = (x, y) => {
    x = Math.abs(x);
    let d = Infinity;
    for (const [nx, r] of G.NAC) d = Math.min(d, sdCap(x, y, nx, LE(nx) + G.NAC_F, r * .9, nx, LE(nx) - G.NAC_B, r * .7));
    return d;
  };
  const wing = (x, y) => sdPoly(Math.abs(x), y, G.WING) - G.WING_R;
  const tail = (x, y) => sdPoly(Math.abs(x), y, G.TAIL) - G.TAIL_R;
  M.sd = { fus, nac, wing, tail };
  M.planeD = (x, y) => Math.min(fus(x, y), nac(x, y), wing(x, y), tail(x, y));

  // ---------- zones ----------
  M.ZONES = ["Engines", "Wings and tail", "Fuselage"];
  M.ENGINES = 0; M.WINGS = 1; M.FUSELAGE = 2;
  M.zoneAt = (x, y) => {
    if (nac(x, y) < 0) return 0;
    if (fus(x, y) < 0) return 2;
    if (wing(x, y) < 0 || tail(x, y) < 0) return 1;
    return -1;
  };
  // the front of each nacelle, left to right (where engine fire and smoke start)
  M.engineFronts = () => [-G.NAC[1][0], -G.NAC[0][0], G.NAC[0][0], G.NAC[1][0]].map(x => [x, LE(Math.abs(x)) + G.NAC_F]);

  // ---------- simulation ----------
  M.rng = seed => {
    let s = seed >>> 0;
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  M.poisson = (r, lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };

  // Each sortie takes 1 + Poisson(lam) hits, uniformly over the airframe.
  // A hit brings the plane down with probability q[zone]: engines are the deadly place.
  M.PARAMS = { sorties: 300, lam: 2.2, q: [.42, .01, .01], seed: 168 };
  M.simulate = (P = M.PARAMS) => {
    const r = M.rng(P.seed), sorties = [];
    for (let s = 0; s < P.sorties; s++) {
      const n = 1 + M.poisson(r, P.lam), hits = [];
      let fatal = -1;
      for (let k = 0; k < n; k++) {
        let x, y, z;
        do { x = r() * 2 - 1; y = r() * 1.5 - .75; z = M.zoneAt(x, y); } while (z < 0);
        hits.push({ x, y, z });
        if (r() < P.q[z] && fatal < 0) fatal = k;
      }
      sorties.push({ id: s, hits, fatal, lost: fatal >= 0 });
    }
    // holes in the order they are counted: returned planes land in sortie order
    const holes = [];
    let ret = 0, lostN = 0, ghost = 0;
    for (const s of sorties) {
      if (s.lost) s.ghost = ghost++;
      for (const h of s.hits) holes.push({ ...h, sortie: s.id, lost: s.lost, ghost: s.lost ? s.ghost : -1, order: s.lost ? lostN++ : ret++ });
    }
    const lost = sorties.filter(s => s.lost).length;
    return { sorties, holes, back: P.sorties - lost, lost, retHoles: ret, lostHoles: lostN };
  };

  // average holes per plane, zone by zone, for planes that came home and planes that didn't
  M.stats = S => M.ZONES.map((name, z) => ({
    zone: name,
    back: S.holes.filter(h => !h.lost && h.z === z).length / S.back,
    lost: S.holes.filter(h => h.lost && h.z === z).length / S.lost,
  }));

  // the share of planes with at least one hole in each part: the film's headline numbers
  M.shareHit = S => M.ZONES.map((zone, z) => {
    const hit = s => s.hits.some(h => h.z === z), back = S.sorties.filter(s => !s.lost), lost = S.sorties.filter(s => s.lost);
    return { zone, back: back.filter(hit).length / back.length, lost: lost.filter(hit).length / lost.length };
  });

  // the viewer's own plane: one of the 300, so the chance it's lost is the data's own 1 in 6
  M.pickSortie = (S, rand, fate) => {
    const pool = fate === "lost" ? S.sorties.filter(s => s.lost) : fate === "home" ? S.sorties.filter(s => !s.lost) : S.sorties;
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  };

  (root.HOLES = root.HOLES || {}).model = M;
  if (typeof module !== "undefined") module.exports = M;
})(typeof window !== "undefined" ? window : globalThis);
