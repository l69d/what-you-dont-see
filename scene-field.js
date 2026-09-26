// Scenes 2 and 3: the airfield at home by day (the homecoming) and by night (the ghosts).
// Cut-paper collage after Ravilious and Matisse: flat torn shapes, tiny drop shadows, an English palette.
// World units: one B-17 is 2 wide, +y is north, the base sits at the origin. Everything is a pure function of t (seeded).
// Data rows: 10 planes (x, y, heading, altitude 0..1, or -1 hidden), 11 planes (scale, gold, props 0..1, seed),
//            13 the six empty hardstands (x, y, nose heading, gold), 14 ghosts (x, y, heading, scale), 15 ghosts (alpha, gold, vx, vy).
// ctx: your (the viewer's sortie; in the lab ?your=home|lost picks one from ctx.sim), sim, lab.
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.scenes = H.scenes || {};
  const M = H.model;
  const clamp01 = x => Math.max(0, Math.min(1, x)), ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------------- the base ----------------
  // perimeter track, counter-clockwise; the runways run between its vertices, the first is the main one (landing from its first end)
  const PER = [[15, -.3], [13.4, 5.4], [8.2, 9.2], [2.4, 10.8], [-3.4, 10], [-9.6, 6.4], [-14.2, -1.2],
    [-11.8, -7.6], [-6.8, -9.4], [2.6, -10.2], [12.2, -7.4]].map(([x, y]) => [x * .8, y * .8]);
  const RUNS = [[8, 2, .85], [10, 4, .72], [6, 0, .72]];   // [from vertex, to vertex, half width]
  const NP = PER.length, segL = [], cum = [0];
  for (let i = 0; i < NP; i++) { const a = PER[i], b = PER[(i + 1) % NP]; segL.push(Math.hypot(b[0] - a[0], b[1] - a[1])); cum.push(cum[i] + segL[i]); }
  const PLEN = cum[NP];
  const wrap = s => ((s % PLEN) + PLEN) % PLEN;
  const perAt = s => {
    s = wrap(s); let i = 0; while (i < NP - 1 && s > cum[i + 1]) i++;
    const k = (s - cum[i]) / segL[i], a = PER[i], b = PER[(i + 1) % NP];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  const segD = (p, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], h = clamp01(((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / (bx * bx + by * by));
    return Math.hypot(p[0] - a[0] - bx * h, p[1] - a[1] - by * h); };

  // buildings: [x, y, half length, half width, angle, kind]
  // kind 0 house, 1 church nave, 2 church tower, 3 T2 hangar, 4 Nissen hut, 5 control tower, 6 barn
  const BLD = [[-6.9, 2.3, 2.4, 1.1, .52, 3], [3.4, -5.6, 2.4, 1.1, -.1, 3], [6.2, -2.6, .5, .45, -.1, 5]];
  for (let i = 0; i < 4; i++) BLD.push([.2 + (i % 2) * .9, -3.6 - Math.floor(i / 2) * 1.05, .36, .19, 1.47, 4]);
  const NBASE = BLD.length;
  // the village strung along a lane south of the base, a church, and a few farms
  const laneA = x => -15.4 + 1.3 * Math.sin(.16 * x + .7) + .55 * Math.sin(.41 * x + 2.1);
  {
    const r = M.rng(1943);
    for (let i = 0; i < 16; i++) {
      const x = -9.5 + i * .62 + (r() - .5) * .3, side = i % 2 ? 1 : -1, sl = (laneA(x + .05) - laneA(x - .05)) / .1;
      const a = Math.atan(sl) + (r() - .5) * .15, off = .72 + r() * .5;
      BLD.push([x - Math.sin(a) * off * side, laneA(x) + Math.cos(a) * off * side, .2 + r() * .16, .14 + r() * .05, a + (r() < .25 ? Math.PI / 2 : 0), 0]);
    }
    BLD.push([-6.3, laneA(-6.3) - 1.75, .62, .24, .12, 1], [-7.05, laneA(-6.3) - 1.84, .21, .21, .12, 2]);
    for (const [x, y, a] of [[19, 8, .3], [-19, 9, -.2], [17.5, -13, .9], [-22, -6, .1], [9, 16.5, -.4], [-10, 16, .6]]) {
      BLD.push([x, y, .75, .32, a, 6], [x + .9 * Math.cos(a + 1.3), y + .9 * Math.sin(a + 1.3), .45, .2, a + Math.PI / 2, 6], [x - .6, y - .8, .26, .17, a, 0]);
    }
  }

  // hardstands: frying pans off the perimeter track, outside it near and far alternately, then inside where the grass allows
  const PAD_R = 1.06, PADS = [];
  const ends = RUNS.flatMap(r => [cum[r[0]], cum[r[1]]]);
  const circ = (a, b) => { const d = Math.abs(wrap(a - b)); return Math.min(d, PLEN - d); };
  const tryPad = (s, off) => {
    const a = perAt(s - .9), b = perAt(s + .9), l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
    const S = perAt(s), C = [S[0] + n[0] * off, S[1] + n[1] * off];
    const ok = PADS.every(q => Math.hypot(q.x - C[0], q.y - C[1]) > 2 * PAD_R + .2 && segD([q.x, q.y], S, C) > PAD_R + .32 && segD(C, [q.sx, q.sy], [q.x, q.y]) > PAD_R + .32) &&
      RUNS.every(r => segD(C, PER[r[0]], PER[r[1]]) > PAD_R + r[2] + .25) &&
      BLD.slice(0, NBASE).every(q => Math.hypot(q[0] - C[0], q[1] - C[1]) > PAD_R + Math.hypot(q[2], q[3]) + .2) &&
      PER.every((p, i) => segD(C, p, PER[(i + 1) % NP]) > PAD_R + .35);
    // head: the nose-out heading (nose back toward the track); heading a points the nose along (-sin a, cos a)
    if (ok) PADS.push({ x: C[0], y: C[1], sx: S[0], sy: S[1], s: wrap(s), off, head: Math.atan2(n[0] * Math.sign(off), -n[1] * Math.sign(off)) });
    return ok;
  };
  for (let s = .5, far = 0; s < PLEN - .3 && PADS.length < 36; s += .62)
    if (!ends.some(e => circ(s, e) < 1.55) && (tryPad(s, far ? 4.1 : 1.95) || tryPad(s, far ? 1.95 : 4.1))) far = PADS[PADS.length - 1].off > 3 ? 0 : 1;
  for (let s = .2; s < PLEN && PADS.length < 36; s += .5) if (!ends.some(e => circ(s, e) < 2.2)) tryPad(s, -1.95);
  PADS.sort((a, b) => a.s - b.s);
  const nearPad = (x, y) => PADS.reduce((bi, p, i) => Math.hypot(p.x - x, p.y - y) < Math.hypot(PADS[bi].x - x, PADS[bi].y - y) ? i : bi, 0);

  // the six empty hardstands. E and Y stand side by side on the north side, where the camera ends up; Z is the far pan between them.
  // Home: E, Z and four more stay empty and the viewer's plane parks on Y. Lost: Y stays empty (a gold ring) and Z is taken.
  const PICK = { e: nearPad(.4, 10.4), y: nearPad(3.6, 10.2), z: nearPad(2.1, 12.7) };
  const EMPTY4 = [nearPad(-3.7, -9.6), nearPad(-9.7, 5.5), nearPad(3.8, -9.7), nearPad(2.8, 6.4)];

  // ---------------- the homecoming: 30 planes land on the main runway and taxi to their hardstands ----------------
  const MAIN = RUNS[0], T0 = PER[MAIN[0]], F0 = PER[MAIN[1]];
  const RLEN = Math.hypot(F0[0] - T0[0], F0[1] - T0[1]), RU = [(F0[0] - T0[0]) / RLEN, (F0[1] - T0[1]) / RLEN];
  const TD = 2.2, SF = cum[MAIN[1]];                                     // touchdown past the threshold; track position of the far end
  const V0 = 9, A1 = 2.4, V1 = 7, DS = 1.3, PIV = 1, APPR = 6.5;          // units/s, braking, final stop distance, pivot s, glide
  const D1 = (V0 * V0 - V1 * V1) / (2 * A1), TT1 = (V0 - V1) / A1;
  const SH = [-.924, .383];                                              // shadows fall to the west-north-west (sun low in the ESE)
  const KY = 19, N = 30;                                                 // the viewer's slot in the stream, and the stream

  const planCache = {};
  function plans(lost) {
    if (planCache[lost]) return planCache[lost];
    const special = lost ? PICK.z : PICK.y, empty = [PICK.e, ...EMPTY4, lost ? PICK.y : PICK.z];
    const occ = PADS.map((p, i) => i).filter(i => !empty.includes(i) && i !== special).map(i => ({ i, d: wrap(PADS[i].s - SF) })).sort((a, b) => a.d - b.d);
    // the nearer half goes counter-clockwise, the rest clockwise; each side fills from its far end, the sides alternate
    const half = occ.length >> 1, far = (a, b) => b.D - a.D;
    const ccw = occ.slice(0, half).map(o => ({ i: o.i, dir: 1, D: o.d })).sort(far);
    const cw = occ.slice(half).map(o => ({ i: o.i, dir: -1, D: PLEN - o.d })).sort(far);
    const order = [];
    while (ccw.length || cw.length) order.push((order.length & 1 ? cw.shift() : ccw.shift()) || cw.shift() || ccw.shift());
    const sd = wrap(PADS[special].s - SF);
    order.splice(KY, 0, sd < PLEN / 2 ? { i: special, dir: 1, D: sd } : { i: special, dir: -1, D: PLEN - sd });
    // touchdowns: a stream from 2.4 s, with a breath either side of the viewer's plane at 9 s
    const tdt = k => k < KY ? 2.4 + (8.3 - 2.4) * k / (KY - 1) : k === KY ? 9 : 9.7 + (11.7 - 9.7) * (k - KY - 1) / (N - KY - 2);
    const list = order.map((o, k) => {
      const P = PADS[o.i], spur = Math.hypot(P.x - P.sx, P.y - P.sy), L = RLEN - TD + o.D + spur;
      const t0 = tdt(k), tb = TT1 + (L - DS - D1) / V1;
      return { k, pad: o.i, dir: o.dir, D: o.D, spur, L, t0, park: t0 + tb + 2 * DS / V1 + PIV, mine: !lost && o.i === PICK.y, seed: (k * .618 + .13) % 1 };
    });
    return planCache[lost] = { list, empty };
  }
  // distance along the path, dt seconds after touchdown (negative: still on the approach)
  function pathS(dt, L) {
    if (dt <= 0) return dt * V0;
    if (dt < TT1) return V0 * dt - .5 * A1 * dt * dt;
    const s1 = D1 + V1 * (dt - TT1), sB = L - DS;
    if (s1 < sB) return s1;
    const u = Math.min(dt - TT1 - (sB - D1) / V1, 2 * DS / V1);
    return Math.min(L, sB + V1 * u - .5 * (V1 * V1 / (2 * DS)) * u * u);
  }
  function pathPos(pl, s) {
    const r = RLEN - TD;
    if (s <= r) return [T0[0] + RU[0] * (TD + s), T0[1] + RU[1] * (TD + s)];
    s -= r;
    if (s <= pl.D) return perAt(SF + pl.dir * s);
    const P = PADS[pl.pad], k = Math.min(1, (s - pl.D) / pl.spur);
    return [P.sx + (P.x - P.sx) * k, P.sy + (P.y - P.sy) * k];
  }
  // one plane at time t
  function planeAt(pl, t) {
    const dt = t - pl.t0, s = pathS(dt, pl.L);
    if (s < -26) return { x: 0, y: 0, a: 0, h: -1, props: 0 };
    let x, y, a, h = 0;
    if (s < 0) {
      x = T0[0] + RU[0] * (TD + s); y = T0[1] + RU[1] * (TD + s); a = Math.atan2(-RU[0], RU[1]);
      h = Math.pow(Math.min(1, -s / APPR), .85);
    } else if (s >= pl.L - 1e-4) {
      const P = PADS[pl.pad], k = ease((t - (pl.park - PIV)) / PIV);      // parked: swing round to face out
      x = P.x; y = P.y; a = P.head + Math.PI * (1 - k);
    } else {
      const e = .3, p0 = pathPos(pl, Math.max(0, s - e)), p1 = pathPos(pl, s), p2 = pathPos(pl, Math.min(pl.L, s + e));
      x = (p0[0] + 2 * p1[0] + p2[0]) / 4; y = (p0[1] + 2 * p1[1] + p2[1]) / 4;
      const q0 = pathPos(pl, Math.max(0, s - .45)), q1 = pathPos(pl, Math.min(pl.L, s + .45));
      a = Math.atan2(-(q1[0] - q0[0]), q1[1] - q0[1]);
    }
    return { x, y, a, h, props: t < pl.park + .4 ? 1 : clamp01(1 - (t - pl.park - .4) / 1.2) };
  }

  // ---------------- cameras: [t, x, y, zoom, rot], Catmull-Rom through the keys, zoom in log space ----------------
  const TARGET = [lerp(PADS[PICK.e].x, PADS[PICK.y].x, .5), lerp(PADS[PICK.e].y, PADS[PICK.y].y, .5) - .15];
  const FIELD_CAM = [[0, -11, -13, 14.5, .07], [3.5, -5.5, -6.5, 11.8, .04], [8, -1, -.5, 11, .01], [12, 1.5, 5.2, 9.6, -.01],
    [15, 2.1, 8.4, 7.6, -.03], [20, TARGET[0], TARGET[1], 3.5, -.05]];
  const NIGHT_C = [4, 7];
  const NIGHT_CAM = [[0, TARGET[0], TARGET[1], 5, -.05], [3, TARGET[0] - .3, TARGET[1] + .2, 5.6, -.04], [10, NIGHT_C[0], NIGHT_C[1], 40, 0], [16, NIGHT_C[0], NIGHT_C[1] + .3, 41, 0]];
  function camAt(keys, t) {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = ease((t - k1[0]) / (k2[0] - k1[0])) * .5 + clamp01((t - k1[0]) / (k2[0] - k1[0])) * .5;
    const cr = (a, b, c, d) => .5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    return [1, 2, 3, 4].map(j => j === 3 ? Math.exp(cr(...[k0, k1, k2, k3].map(k => Math.log(k[j])))) : cr(k0[j], k1[j], k2[j], k3[j]));
  }

  const yourOf = ctx => {
    if (ctx.your) return ctx.your;
    const fate = ctx.lab && typeof location !== "undefined" ? new URLSearchParams(location.search).get("your") : null;
    return ctx.sim.sorties.find(s => fate === "lost" ? s.lost : !s.lost);
  };

  // ---------------- the night: 50 ghosts, six from our empty hardstands, 44 from the airfields around ----------------
  // the other airfields, as paper tokens: [x, y, rot, scale]
  const AIR = [[-31, 15, .4, .5], [-33, -5, -.3, .46], [-15, 23, 1.1, .42], [23, 21, -.6, .5], [37, 4, .2, .48],
    [46, 20, .9, .42], [29, -9, -1, .46], [-21, -12, .8, .42], [48, -9, .5, .4], [-44, 24, .3, .4]];
  const slot = g => [NIGHT_C[0] + (g % 10 - 4.5) * 7.2, NIGHT_C[1] + 16.2 - Math.floor(g / 10) * 3.1];
  const ghostCache = {};
  function ghostPlan(lost, yourGhost) {
    const key = lost + ":" + yourGhost;
    if (ghostCache[key]) return ghostCache[key];
    const r = M.rng(77), out = [], free = [...Array(50).keys()].filter(g => !(lost && g === yourGhost));
    const dT = j => Math.hypot(PADS[j].x - TARGET[0], PADS[j].y - TARGET[1]);
    plans(lost).empty.slice().sort((a, b) => dT(a) - dT(b)).forEach((j, n) => {
      const mine = lost && j === PICK.y, P = PADS[j];
      out.push({ g: mine ? yourGhost : free.shift(), x: P.x, y: P.y, a: P.head, t0: .5 + n * .6, gold: mine ? 1 : 0 });
    });
    for (let i = 0; i < 44; i++) {
      const A = AIR[i % AIR.length], an = r() * 6.283, lx = Math.cos(an) * 13.8, ly = Math.sin(an) * 10.3, c = Math.cos(A[2]), s = Math.sin(A[2]);
      const x = A[0] + (c * lx - s * ly) * A[3], y = A[1] + (s * lx + c * ly) * A[3];
      out.push({ g: free.shift(), x, y, a: r() * 6.283, t0: 3.7 + Math.min(3.6, .085 * Math.hypot(x - NIGHT_C[0], y - NIGHT_C[1])) + r() * .6, gold: 0 });
    }
    for (const G of out) {
      const an = r() * 6.283;
      Object.assign(G, { dx: Math.cos(an) * .8, dy: Math.sin(an) * .8 + .5, turn: (r() - .5) * .7, ph: r() * 6.283, tg: 9 + r() * 1.3 });
    }
    return ghostCache[key] = out;
  }
  function ghostAt(G, t) {
    const k = ease((t - G.t0) / 2.8), al = clamp01((t - G.t0) / .8);
    let x = G.x + G.dx * k + .14 * Math.sin(t * .9 + G.ph) * k, y = G.y + G.dy * k + .1 * Math.cos(t * .7 + G.ph) * k;
    let a = G.a + G.turn * k + .05 * Math.sin(t * .6 + G.ph), sc = 1 + .8 * k;
    const g = ease((t - G.tg) / 3.6), [fx, fy] = slot(G.g), bow = Math.sin(Math.PI * g) * 1.5;
    const da = ((0 - a) % 6.283 + 6.283 + Math.PI) % 6.283 - Math.PI;
    x = lerp(x, fx, g) + bow * Math.cos(G.ph); y = lerp(y, fy, g) + .03 * Math.sin(t * 1.3 + G.ph) * g;
    return { x, y, a: a + da * g, sc: lerp(sc, 1.9, g), al };
  }

  // ---------------- GLSL ----------------
  const f3 = x => (+x).toFixed(3), v2 = (x, y) => `vec2(${f3(x)}, ${f3(y)})`, v4 = (...a) => `vec4(${a.map(f3).join(", ")})`;
  const arr = (t, name, items) => `const ${t} ${name}[${items.length}] = ${t}[${items.length}](${items.join(", ")});`;
  const BAKED = [
    `const int FLD_NPER = ${NP}, FLD_NPAD = ${PADS.length}, FLD_NBLD = ${BLD.length}, FLD_NAIR = ${AIR.length};`,
    `const float FLD_PADR = ${f3(PAD_R)};`,
    `const vec2 FLD_RWYEND = ${v2(...F0)};`,
    arr("vec2", "FLD_PER", PER.map(p => v2(...p))),
    arr("vec4", "FLD_RUN", RUNS.map(r => v4(...PER[r[0]], ...PER[r[1]]))),
    arr("float", "FLD_RUNW", RUNS.map(r => f3(r[2]))),
    arr("vec4", "FLD_PAD", PADS.map(p => v4(p.x, p.y, p.sx, p.sy))),
    arr("vec4", "FLD_BLD", BLD.map(b => v4(b[0], b[1], b[2], b[3]))),
    arr("vec2", "FLD_BLDK", BLD.map(b => v2(b[4], b[5]))),
    arr("vec4", "FLD_AIR", AIR.map(a => v4(...a))),
  ].join("\n");

  const GLSL_WORLD = /* glsl */ `
// ================= scene-field.js: the airfield, shared by scene 2 (day) and scene 3 (night) =================
${BAKED}
const vec2 FLD_SH = vec2(${f3(SH[0])}, ${f3(SH[1])});   // shadows fall to the west-north-west
const vec2 FLD_MOON = vec2(-.45, .89);                  // toward the moon
const vec3 FLD_GOLD = vec3(1., .80, .42);
const vec3 FLD_OD = vec3(.30, .31, .20);
float fld_pix;     // one pixel in world units
float fld_ht;      // height of the paper under the pixel; its screen derivative lights the cut edges
float fld_nt;      // 1 at night
vec3 fld_lamp;     // lamplight gathered while drawing, added after the night grade

void fld_put(inout vec3 col, float d, vec3 c, float h) { float a = fill(d, fld_pix * 1.5); col = mix(col, c, a); fld_ht = mix(fld_ht, h, a); }
// a soft, cool drop shadow; ds is the caster's distance evaluated at the shadow's offset
void fld_drop(inout vec3 col, float ds, float soft, float k) { col = mix(col, col * vec3(.56, .6, .74), k * sat(.5 - ds / max(soft, fld_pix * 1.5))); }
void fld_glow(vec2 p, vec2 c, float r, vec3 k) { vec2 d = p - c; fld_lamp += k * exp(-dot(d, d) / (r * r)); }

// Voronoi that also gives the unit direction toward the nearest border (x: border distance, y: cell id)
vec2 fld_vor(vec2 x, out vec2 bn) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.), mr = vec2(0.);
  float md = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.; bn = vec2(0., 1.);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), r = g + hash22(n + g) - f, e = r - mr;
    if (dot(e, e) > 1e-5) { vec2 u = normalize(e); float d = dot(.5 * (mr + r), u); if (d < bd) { bd = d; bn = u; } }
  }
  return vec2(bd, hash21(n + mg));
}

// lanes: gentle curves between the hedges (distance to the nearest)
float fld_laneA(float x) { return -15.4 + 1.3 * sin(.16 * x + .7) + .55 * sin(.41 * x + 2.1); }
float fld_laneB(float y) { return -19.5 + 1.7 * sin(.13 * y + .4) + .6 * sin(.37 * y); }
float fld_laneC(float y) { return 20.5 + 1.4 * sin(.19 * y + 1.) + .5 * sin(.47 * y); }
float fld_lanes(vec2 p) {
  float a = fld_laneA(p.x), da = (fld_laneA(p.x + .02) - a) / .02;
  float b = fld_laneB(p.y), db = (fld_laneB(p.y + .02) - b) / .02;
  float c = fld_laneC(p.y), dc = (fld_laneC(p.y + .02) - c) / .02;
  float d = min(abs(p.y - a) / sqrt(1. + da * da), min(abs(p.x - b) / sqrt(1. + db * db), abs(p.x - c) / sqrt(1. + dc * dc)));
  // and one down from the village to the south
  float s = -4.2 + .9 * sin(.35 * p.y);
  if (p.y < a) d = min(d, abs(p.x - s));
  return d;
}

// the English palette: sage, moss, wheat, ochre, ploughland, pale meadow, chalk
vec3 fld_tone(float k) {
  if (k < .2) return vec3(.55, .61, .45);
  if (k < .33) return vec3(.36, .45, .29);
  if (k < .5) return vec3(.81, .71, .47);
  if (k < .62) return vec3(.73, .56, .31);
  if (k < .76) return vec3(.49, .37, .27);
  if (k < .9) return vec3(.65, .69, .52);
  return vec3(.79, .77, .68);
}

// the patchwork: torn-paper fields, drill lines and furrows, hedgerows swelling into trees
vec3 fld_country(vec2 p) {
  vec2 w = p + (vec2(vnoise(p * .2), vnoise(p * .2 + 9.3)) - .5) * 2.4;
  vec2 bn; vec2 v = fld_vor(w * .23, bn);
  float bd = v.x / .23, id = v.y, k = fract(id * 7.13);
  vec3 col = fld_tone(k) * (.95 + .1 * fract(id * 91.7));
  float ang = id * 40., fr = k > .62 && k < .76 ? 4.2 : 7. + 5. * fract(id * 5.3);
  float aa = fr * fld_pix * 1.3, fade = sat(1.3 - aa * 2.2);
  float ln = smoothstep(.22 + aa, .22 - aa, abs(fract(dot(p, vec2(cos(ang), sin(ang))) * fr) - .5)) * fade;
  if (k > .33 && k < .76) col = mix(col, col * (k > .62 ? .74 : .87), ln);
  else if (k > .76 && k < .9) {                                    // meadow stipple
    vec2 c = floor(p * 3.3), o = fract(p * 3.3) - .5 - (hash22(c) - .5) * .5;
    col *= 1. - .1 * fill(length(o) - .09, fld_pix * 3.3 * 1.5) * sat(1.5 - fld_pix * 3.3 * 4.);
  }
  float lump = smoothstep(.42, .8, vnoise(p * 1.9 + id * 17.));
  float hw = max(.05 + .13 * lump, fld_pix * .8);
  fld_drop(col, abs(bd - dot(bn, -FLD_SH) * .22) - hw, .07, .5);
  fld_put(col, bd - hw + .035 * (vnoise(p * 9.) - .5), mix(vec3(.15, .23, .13), vec3(.22, .3, .16), lump), .8);
  return col;
}

// one tree per 1.15-unit cell where the cell says so; copses where a slow noise is high. x: distance to the crown, y: seed
vec2 fld_tree(vec2 p) {
  vec2 c0 = floor(p / 1.15 - .5), r = vec2(9., 0.);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec2 c = c0 + vec2(float(i), float(j));
    vec3 h = hash32(c * 1.7 + 11.);
    float copse = smoothstep(.66, .82, vnoise(c * .16 + 5.));
    if (h.z > .025 + .95 * copse) continue;
    float d = length(p - (c + .2 + .6 * h.xy) * 1.15) - (.15 + .12 * fract(h.z * 17.) + .3 * copse);
    if (d < r.x) r = vec2(d, h.x);
  }
  return r;
}
void fld_trees(inout vec3 col, vec2 p) {
  fld_drop(col, fld_tree(p - FLD_SH * .3).x, .06, .5);
  vec2 t = fld_tree(p);
  if (t.x > .05) return;
  float e = t.x + .03 * (vnoise(p * 13.) - .5);
  vec3 c = mix(vec3(.19, .28, .16), vec3(.28, .36, .19), t.y);
  fld_put(col, e, c, 1.);
  fld_put(col, max(e + .035, fld_tree(p + FLD_SH * .08).x + .02), c * 1.3 + .03, 1.1);   // the sunlit side of the crown
}

// ---- the airfield ----
float fld_perim(vec2 p, out float inside) {
  float d = 1e9; bool in_ = false;
  for (int i = 0; i < FLD_NPER; i++) {
    vec2 a = FLD_PER[i], b = FLD_PER[(i + 1) % FLD_NPER];
    d = min(d, sdSeg(p, a, b));
    if ((a.y > p.y) != (b.y > p.y) && p.x < a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y)) in_ = !in_;
  }
  inside = in_ ? 1. : 0.;
  return d;
}
// concrete under p. x: distance; y: kind (runway i as i/10, 1 track, 2 hardstand); z: along the runway or the pad's index; w: across the runway or from the pad's centre
vec4 fld_concrete(vec2 p, float dPer) {
  vec4 c = vec4(dPer - .2, 1., 0., 0.);
  for (int i = 0; i < 3; i++) {
    vec4 r = FLD_RUN[i]; vec2 u = normalize(r.zw - r.xy), m = p - .5 * (r.xy + r.zw);
    float hl = .5 * length(r.zw - r.xy);
    vec2 l = vec2(dot(m, u), dot(m, vec2(-u.y, u.x)));
    float d = sdBox(l, vec2(hl, FLD_RUNW[i]));
    if (d < c.x) c = vec4(d, float(i) * .1, l.x + hl, l.y);
  }
  for (int j = 0; j < FLD_NPAD; j++) {
    vec4 P = FLD_PAD[j]; vec2 dp = p - P.xy;
    if (dot(dp, dp) > 28.) continue;
    float d = min(length(dp) - FLD_PADR, sdSeg(p, P.zw, P.xy) - .19);
    if (d < c.x) c = vec4(d, 2., float(j), length(dp));
  }
  return c;
}
vec3 fld_concCol(vec2 p, vec4 c) {
  vec3 col = vec3(.75, .73, .67);
  if (c.y < .5) {
    col *= .96 + .06 * hash11(floor(c.z / 1.3) * 3.1 + c.y * 170.);              // laid in panels
    col *= 1. - .16 * fill(abs(fract(c.z / 1.3 + .5) - .5) * 1.3 - .006, fld_pix * 1.5);
    if (c.y < .05) {                                                              // tyre smudges where they touch down
      float tm = smoothstep(1., 2.6, c.z) * smoothstep(9., 3., c.z) * smoothstep(.14, .02, abs(abs(c.w) - .37));
      col *= 1. - .3 * tm * vnoise(vec2(c.z * .9, c.w * 6.));
    }
  } else if (c.y < 1.5) col *= .94;
  else {
    col *= .95 + .07 * hash11(c.z * 5.3);
    col *= 1. - (.05 + .08 * hash11(c.z * 1.7)) * smoothstep(.36, .3, c.w + .12 * (vnoise(p * 4.) - .5));   // an oil stain
  }
  return col;
}
vec3 fld_grass(vec2 p) {
  return vec3(.57, .62, .47) * (.97 + .045 * step(.5, fract(dot(p, vec2(.6, .8)) * .36)));   // mown in broad stripes
}

// buildings: [x, y, half length, half width], [angle, kind]. kind 0 house, 1 nave, 2 tower, 3 hangar, 4 Nissen hut, 5 control tower, 6 barn
void fld_buildings(inout vec3 col, vec2 p) {
  for (int i = 0; i < FLD_NBLD; i++) {
    vec4 b = FLD_BLD[i]; vec2 dp = p - b.xy; float R = length(b.zw) + .7;
    if (dot(dp, dp) > R * R) continue;
    vec2 ak = FLD_BLDK[i]; int kind = int(ak.y + .5);
    mat2 m = rot(-ak.x);
    float sl = kind == 3 ? .5 : kind == 5 ? .42 : kind == 2 ? .6 : kind == 6 ? .26 : .17;
    vec2 l = m * dp;
    fld_drop(col, sdBox(m * (dp - FLD_SH * sl), b.zw), .03 + sl * .08, .55);
    float d = sdBox(l, b.zw) + .012 * (vnoise(l * 23.) - .5);
    vec2 half_ = rot(ak.x) * vec2(0., l.y < 0. ? -1. : 1.);
    float lit = dot(half_, -FLD_SH);                                              // which way this half of the roof faces
    vec3 c;
    if (kind == 0 || kind == 1 || kind == 6) {
      c = kind == 0 ? vec3(.67, .30, .21) * (.9 + .2 * hash11(float(i))) : kind == 1 ? vec3(.46, .47, .48) : vec3(.37, .29, .23);
      c *= .86 + .22 * lit;
      c *= 1. - .3 * fill(abs(l.y) - .006, fld_pix * 1.5);                         // the ridge
      if (kind == 0) c = mix(c, vec3(.3, .16, .12), fill(length(l - vec2(b.z * .55, b.w * .45)) - .035, fld_pix * 1.5));   // chimney
    } else if (kind == 3) {
      c = vec3(.37, .42, .41) * (.86 + .2 * lit);
      c *= 1. - .1 * smoothstep(.3, .45, abs(fract(l.x * 5.) - .5)) * sat(1.5 - fld_pix * 20.);   // corrugations
      c *= 1. - .3 * fill(abs(l.y) - .008, fld_pix * 1.5);
    } else if (kind == 4) {
      d = sdBox(l, b.zw - .07) - .07;
      c = vec3(.42, .46, .41) * (.8 + .28 * lit * sat(abs(l.y) / b.w));
      c *= 1. - .1 * smoothstep(.3, .45, abs(fract(l.x * 9.) - .5)) * sat(1.5 - fld_pix * 30.);
    } else if (kind == 5) {
      c = vec3(.84, .81, .74);
      c *= 1. - .45 * stroke(sdBox(l, b.zw - .05), .012, fld_pix * 1.5);            // the parapet
      c = mix(c, vec3(.55, .6, .6), fill(sdBox(l - vec2(0., .12), vec2(.2, .14)), fld_pix * 1.5));   // the glasshouse on the roof
    } else {
      c = vec3(.5, .5, .48) * (.9 + .15 * lit);
      c *= 1. - .35 * stroke(sdBox(l, b.zw - .03), .015, fld_pix * 1.5);
    }
    fld_put(col, d, c, kind == 3 || kind == 2 ? 1.6 : 1.2);
    if (fld_nt > 0.) {                                                            // lamps: a few windows, the tower, hut doors
      if (kind == 5) fld_glow(p, b.xy + rot(ak.x) * vec2(0., -b.w - .05), .12, vec3(1., .72, .38) * .9);
      if (kind == 4 && hash11(float(i) * 3.3) > .4) fld_glow(p, b.xy + rot(ak.x) * vec2(b.z + .03, 0.), .06, vec3(1., .7, .35) * .7);
      if (kind == 0 && hash11(float(i) * 7.7) > .72) fld_glow(p, b.xy, .1, vec3(1., .66, .3) * .45);
    }
  }
}

// another airfield seen from high up: a paper token with its A of runways, its ring and its pans
void fld_mark(inout vec3 col, vec2 p, vec4 a) {
  vec2 dp = p - a.xy;
  float R = 16. * a.w;
  if (dot(dp, dp) > R * R) return;
  mat2 m = rot(-a.z);
  vec2 l = m * dp / a.w, ls = m * (dp - FLD_SH * .25) / a.w;
  float tok = (length(l / vec2(15., 11.5)) - 1.) * 11.5 * a.w;
  fld_drop(col, (length(ls / vec2(15., 11.5)) - 1.) * 11.5 * a.w, .1, .45);
  fld_put(col, tok + .05 * (vnoise(p * 3.) - .5), fld_grass(p) * 1.03, .3);
  float d = (abs(length(l / vec2(12., 8.8)) - 1.) * 8.8 - .3) * a.w;
  for (int i = 0; i < 3; i++) {
    vec4 r = FLD_RUN[i]; vec2 u = normalize(r.zw - r.xy), q = l - .5 * (r.xy + r.zw);
    d = min(d, sdBox(vec2(dot(q, u), dot(q, vec2(-u.y, u.x))), vec2(.5 * length(r.zw - r.xy), FLD_RUNW[i] * 1.3)) * a.w);
  }
  float an = atan(l.y, l.x), st = TAU / 22., ca = (floor(an / st) + .5) * st;
  d = min(d, (length(l - vec2(cos(ca) * 13.8, sin(ca) * 10.3)) - 1.1) * a.w);
  fld_put(col, d, vec3(.78, .76, .7), .5);
  if (fld_nt > 0.) fld_glow(p, a.xy + rot(a.z) * vec2(13., -3.) * a.w, .25, vec3(1., .7, .35) * .8);
}

vec3 fld_world(vec2 p) {
  fld_ht = 0.;
  float inside = 0., dPer = 1e3;
  bool near = dot(p, p) < 420.;
  if (near) dPer = fld_perim(p, inside);
  float apron = max(inside, fill(dPer - .75, fld_pix * 1.5));
  vec3 col = vec3(0.);
  if (apron < 1.) {
    col = fld_country(p);
    float dl = fld_lanes(p);
    if (dl < .4) {
      fld_drop(col, fld_lanes(p - FLD_SH * .05) - .13, .04, .3);
      fld_put(col, dl - .13 + .02 * (vnoise(p * 8.) - .5), vec3(.8, .76, .64), .3);
    }
    fld_trees(col, p);
  }
  col = mix(col, fld_grass(p), apron);
  fld_ht = mix(fld_ht, .15, apron);
  if (near) {
    vec4 c = fld_concrete(p, dPer);
    if (c.x < .05) fld_put(col, c.x + .012 * (vnoise(p * 17.) - .5), fld_concCol(p, c), .4);
  }
  fld_buildings(col, p);
  if (uCam.z > 16.) for (int i = 0; i < FLD_NAIR; i++) fld_mark(col, p, FLD_AIR[i]);
  col *= 1. + .11 * sat(1.4 - fld_pix * 10.) * (fbm(p * 6.1) - .5);              // the paper's own mottle
  return col;
}
`;

  const GLSL_FIELD = /* glsl */ `
// ---- the planes: olive-drab paper cut-outs ----
// lp: plane space; pl: a pixel in plane units; sun: toward the sun in plane space. Returns colour and coverage; glow is extra light
vec4 fld_b17(vec2 lp, float pl, float seed, float gold, float props, vec2 sun, out vec3 glow) {
  glow = vec3(0.);
  float d = planeD(lp), a = fill(d, pl * 1.5);
  vec3 c = FLD_OD * (.9 + .2 * seed);
  c = mix(c, c * 1.25 + .015, fill(planeD(lp - sun * .02) + .022, pl * 1.5));      // the lit upper layer, nudged toward the sun
  c += .045 * smoothstep(.028, 0., abs(lp.x)) * step(-.6, lp.y) * step(lp.y, .56);  // the spine catches the light
  c *= 1. - .16 * fill(pl_nac(lp), pl * 1.5);                                        // cowlings
  c = mix(c, vec3(.72, .78, .8), fill(length((lp - vec2(0., .625)) * vec2(1., .7)) - .04, pl * 1.5));   // glazed nose
  vec2 ip = lp - vec2(-.62, .115);                                                    // the star on the port wing
  c = mix(c, vec3(.16, .19, .32), fill(length(ip) - .068, pl * 1.5));
  c = mix(c, vec3(.9, .88, .83), fill(sdStar5(ip, .058, .42), pl * 1.5));
  // propellers: blades at rest, a faint disc while they turn
  float disc = 1e9;
  for (int i = 0; i < 4; i++) disc = min(disc, length(lp - ENGINE_FRONT[i] - vec2(0., .014)) - .115);
  float blade = fill(planeProps(lp) - .007, pl * 1.2) * (1. - props), spin = fill(disc, pl * 1.5) * props * .28;
  c = mix(c, vec3(.13, .13, .11), sat(max(blade, spin) * 4.) * (1. - a) + blade * a);
  a = max(a, max(blade, spin));
  if (gold > 0.) {
    c = mix(c, FLD_GOLD, stroke(d, .008, pl * 1.5) * gold);
    glow = FLD_GOLD * (exp(-max(d, 0.) / .05) * (1. - a) * .22 + .03 * a) * gold;
  }
  return vec4(c, a);
}
void fld_planes(inout vec3 col, vec2 p) {
  for (int k = 0; k < 30; k++) {                                   // shadows first, all on the ground
    vec4 A = row(10, k);
    if (A.w < 0.) continue;
    vec2 dp = p - A.xy - FLD_SH * (.22 + 2.2 * A.w);
    if (dot(dp, dp) > 1.2) continue;
    fld_drop(col, planeD(rot(-A.z) * dp), .025 + A.w * .2, .5 - .22 * A.w);
  }
  for (int k = 0; k < 30; k++) {                                   // then the planes, the higher ones on top
    vec4 A = row(10, k);
    if (A.w < 0.) continue;
    float sc = 1. + .85 * A.w;
    vec2 dp = p - A.xy;
    if (dot(dp, dp) > sc * sc * 1.45) continue;
    vec4 B = row(11, k);
    vec3 glow; vec4 c = fld_b17(rot(-A.z) * dp / sc, fld_pix / sc, B.w, B.y, B.z, rot(-A.z) * -FLD_SH, glow);
    col = mix(col, c.rgb, c.a);
    if (fld_nt > 0.) fld_lamp += glow; else col += glow;
    fld_ht = mix(fld_ht, 2. + 3. * A.w, c.a);
  }
}

// ---- the ground crews waiting at the empty hardstands ----
// a ground-crew figure: a little dark paper cut-out standing up on the map, feet at c (upright on screen, as on a picture map)
float fld_figD(vec2 l, float pose) {
  float d = min(length(l - vec2(0., .176)) - .025, sdUCap(l, vec2(0., .142), .031, vec2(0., .084), .026));   // head, coat
  d = min(d, sdSeg(vec2(abs(l.x), l.y), vec2(.012, .085), vec2(.016, .006)) - .011);                          // legs
  d = min(d, sdSeg(l, vec2(-.03, .136), vec2(-.037, .084)) - .009);                                            // arms: one down,
  return min(d, pose > .6 ? sdSeg(l, vec2(.03, .136), vec2(.021, .179)) - .009                                // one shading the eyes,
                          : sdSeg(l, vec2(.03, .136), vec2(.037, .084)) - .009);                              // or both down
}
void fld_person(inout vec3 col, vec2 p, vec2 c, float sway, float s) {
  vec2 dp = p - c;
  if (dot(dp, dp) > .2) return;
  fld_drop(col, sdUCap(dp, vec2(0.), .022, FLD_SH * .38, .012), .03, .3);                 // a long morning shadow on the grass
  vec2 l = rot(-uCam.w - sway) * dp / 1.2;
  fld_drop(col, fld_figD(l - rot(-uCam.w) * FLD_SH * .012, s) * 1.2, .01, .5);                 // the cut-out's own drop shadow
  vec3 c0 = mix(vec3(.17, .18, .16), vec3(.29, .27, .21), step(.7, s));
  fld_put(col, fld_figD(l, s) * 1.2, c0, 1.2);
  fld_put(col, (length(l - vec2(0., .188)) - .016) * 1.2, s > .45 ? vec3(.36, .33, .25) : vec3(.12, .1, .09), 1.3);   // a cap
}
void fld_crews(inout vec3 col, vec2 p) {
  for (int e = 0; e < 6; e++) {
    vec4 E = row(13, e);
    vec2 dp = p - E.xy;
    if (dot(dp, dp) > 7.) continue;
    float fe = float(e);
    vec2 nd = vec2(-sin(E.z), cos(E.z)), sd = vec2(nd.y, -nd.x), base = E.xy + nd * 1.3 + sd * .8;   // on the grass beside the spur
    vec2 look = normalize(FLD_RWYEND - base);
    float face = atan(-look.x, look.y);
    base += sd * .1;
    int n = fld_nt > 0. ? 1 : 4;
    for (int i = 0; i < 4; i++) {
      if (i >= n) break;
      float fi = float(i), s = hash11(fi * 7.1 + fe * 3.3);
      vec2 c = base + sd * (fi - 1.5) * .16 + nd * (hash11(fi + fe * 1.7) - .5) * .32;
      c += .01 * vec2(sin(uTime * (1.1 + s) + fi), cos(uTime * (.8 + s) + fi * 2.));   // shifting from foot to foot
      if (i == 3) c += nd * .22 * sin(uTime * .5 + fe);                                  // one of them paces
      fld_person(col, p, c, .05 * sin(uTime * (.7 + s) + fi * 2.), s);
      if (fld_nt > 0.) fld_glow(p, c + look * .05, .09, vec3(1., .7, .35) * 1.2);        // at night, a hand lamp
    }
    vec2 bl = rot(-(face + 1.2)) * (p - base - sd * .5 - nd * .25);                     // a bicycle dropped on the grass
    fld_put(col, min(min(abs(length(bl - vec2(0., .07)) - .045), abs(length(bl + vec2(0., .07)) - .045)), sdSeg(bl, vec2(0., -.07), vec2(0., .07))) - .006, vec3(.14, .14, .13), .9);
    if (E.w > 0.) {                                                                    // the viewer's hardstand keeps a thin gold ring
      float r = length(dp) - FLD_PADR - .08, k = stroke(r, .016, fld_pix * 1.5) * .95;
      if (fld_nt > 0.) fld_lamp += FLD_GOLD * (k + exp(-abs(r) / .12) * .25);
      else col = mix(col, FLD_GOLD, k) + FLD_GOLD * exp(-abs(r) / .12) * .18;
    }
  }
}

// ---- a ghost: the plane that never came back, as a madder-red paper lantern lit from within ----
void fld_ghost(inout vec3 col, vec2 p, int g) {
  vec4 G = row(14, g);
  float sc = G.w, fg = float(g), reach = 1.8 * sc + 4.;
  if (dot(p - G.xy, p - G.xy) > reach * reach) return;                                   // cheap reject before the second fetch
  vec4 G2 = row(15, g);
  float al = G2.x;
  if (al <= 0.) return;
  vec3 red = mix(vec3(.5, .06, .08), vec3(.78, .52, .16), G2.y), ember = mix(vec3(1., .38, .12), vec3(1., .76, .32), G2.y);
  vec3 core = mix(vec3(1., .78, .5), vec3(1., .94, .74), G2.y);
  vec2 v = G2.zw;
  if (dot(v, v) > .003 && sdSeg(p, G.xy, G.xy - v * 1.2) < .9 * sc) {                   // sparks shed behind it
    for (int i = 0; i < 8; i++) {
      float fi = float(i), age = fract(uTime * .7 + hash11(fi * 3.7 + fg * 1.31));
      vec2 c = G.xy - v * age * 1.2 + (hash22(vec2(fi, fg)) - .5) * .9 * sc * (.3 + age);
      col += ember * fill(length(p - c) - max((.05 - .03 * age) * sc, fld_pix * .8), fld_pix * 1.5) * (1. - age) * al * 1.3;
    }
  }
  vec2 dp = p - G.xy;
  if (dot(dp, dp) > 3.3 * sc * sc) return;
  vec2 lp = rot(-G.z) * dp / sc;
  float d = planeD(lp) * sc, inside = fill(d, fld_pix * 1.5), depth = sat(-d / (.07 * sc));
  float heart = exp(-dot(lp * vec2(1.4, 1.), lp * vec2(1.4, 1.)) * 3.5);
  float flick = .92 + .08 * sin(uTime * 7.3 + fg) * sin(uTime * 3.1 + fg * 2.);
  vec3 c = mix(red, ember, depth * .75 + heart * .35);
  c = mix(c, core, heart * depth * .75);
  c = mix(c, core * 1.15, fill(pl_nac(lp) * sc, fld_pix * 1.5) * (.55 + .45 * sin(uTime * 9. + fg + lp.x * 20.)));   // the engines still burn
  c *= .8 + .32 * vnoise(lp * 36.);                                                    // fibres in the lit paper
  c *= 1. - .35 * stroke(d + .012 * sc, .004 * sc, fld_pix * 1.5);                      // its folded edge
  col = mix(col, c * flick, inside * al * .9);
  col += ember * exp(-max(d, 0.) / (.2 * sc)) * al * .3 * flick;
}

vec3 sceneField(vec2 p, vec2 q, vec2 suv) {
  fld_pix = uCam.z / uRes.y; fld_nt = 0.; fld_lamp = vec3(0.);
  vec3 col = fld_world(p);
  fld_crews(col, p);
  fld_planes(col, p);
  // cut edges: the sunward edge of each piece of paper catches the light, the far edge drops a hairline shadow
  float e = dot(vec2(dFdx(fld_ht), dFdy(fld_ht)), rot(-uCam.w) * FLD_SH);
  col *= 1. - .22 * sat(-e * 1.5) + .1 * sat(e * 1.5);
  col *= vec3(1.03, 1., .93) * (1. + .07 * (q.x * .5 - q.y * .2));                     // morning, lit from the east
  return col;
}
`;

  const GLSL_NIGHT = /* glsl */ `
vec3 sceneNight(vec2 p, vec2 q, vec2 suv) {
  fld_pix = uCam.z / uRes.y; fld_nt = 1.; fld_lamp = vec3(0.);
  vec3 col = fld_world(p);
  fld_crews(col, p);
  fld_planes(col, p);
  // the same collage at night: indigo and ultramarine paper, a little of the day's hue left in it
  float l = luma(col);
  vec3 n = mix(vec3(.026, .032, .09), vec3(.2, .25, .52), pow(sat(l * 1.1), 1.3));
  col = mix(n, n * col / max(l, .04), .14);
  float e = dot(vec2(dFdx(fld_ht), dFdy(fld_ht)), rot(-uCam.w) * FLD_MOON);            // moonlight on the cut edges
  col += vec3(.42, .5, .78) * sat(-e * 1.3) * .45;
  col *= 1. - .35 * sat(e * 1.5);
  for (int i = 0; i < 2; i++) {                                                          // searchlights feeling across the fields
    vec2 o = i == 0 ? vec2(-26., -19.) : vec2(33., 15.), d = p - o;
    float th = (i == 0 ? .95 : 3.6) + .35 * sin(uTime * (.21 + .09 * float(i)) + float(i) * 2.);
    float an = mod(atan(d.y, d.x) - th + PI, TAU) - PI, r = length(d);
    col += vec3(.5, .6, .85) * smoothstep(.06, 0., abs(an)) * exp(-r / 40.) * smoothstep(0., 4., r) * .09;
  }
  col += fld_lamp;
  for (int g = 0; g < 50; g++) fld_ghost(col, p, g);
  return col;
}
`;

  // ---------------- registration ----------------
  const home = plans(false);
  const field = H.scenes.field = {
    id: 2, fn: "sceneField", glsl: GLSL_WORLD + GLSL_FIELD,
    beats: { firstLanding: home.list[0].t0, yourLanding: home.list[KY].t0, lastLanding: home.list[N - 1].t0, pushIn: 15, end: 20 },
    state: { landed: 0, yourStand: [PADS[PICK.y].x, PADS[PICK.y].y] },
    update(t, L, E, ctx) {
      const your = yourOf(ctx), lost = !!(your && your.lost), P = plans(lost);
      L.cam = camAt(FIELD_CAM, t);
      let landed = 0;
      P.list.forEach((pl, k) => {
        const s = planeAt(pl, t);
        E.dataRow(10, k, s.x, s.y, s.a, s.h);
        E.dataRow(11, k, 1 + .85 * Math.max(0, s.h), pl.mine ? 1 : 0, s.props, pl.seed);
        if (t >= pl.park) landed++;
      });
      P.empty.forEach((j, e) => E.dataRow(13, e, PADS[j].x, PADS[j].y, PADS[j].head, lost && j === PICK.y ? 1 : 0));
      field.beats.yourLanding = lost ? null : P.list[KY].t0;
      field.state.landed = landed;
    },
  };
  H.scenes.night = {
    id: 3, fn: "sceneNight", glsl: GLSL_NIGHT,
    beats: { rise: .5, craneOut: 3, gather: 9, end: 16 },
    state: { ghosts: [...Array(50).keys()].map(slot) },   // where the 50 ghosts hold formation (world), by ghost index
    update(t, L, E, ctx) {
      const your = yourOf(ctx), lost = !!(your && your.lost), P = plans(lost);
      const yg = lost ? (your.ghost ?? (ctx.sim.sorties[your.id] || {}).ghost ?? 0) : -1;
      L.cam = camAt(NIGHT_CAM, t);
      P.list.forEach((pl, k) => { const s = planeAt(pl, 99); E.dataRow(10, k, s.x, s.y, s.a, 0); E.dataRow(11, k, 1, pl.mine ? 1 : 0, 0, pl.seed); });
      P.empty.forEach((j, e) => E.dataRow(13, e, PADS[j].x, PADS[j].y, PADS[j].head, lost && j === PICK.y ? 1 : 0));
      for (const G of ghostPlan(lost, yg)) {
        const a = ghostAt(G, t), b = ghostAt(G, t - .1);
        E.dataRow(14, G.g, a.x, a.y, a.a, a.sc);
        E.dataRow(15, G.g, a.al, G.gold, (a.x - b.x) * 10, (a.y - b.y) * 10);
      }
    },
  };
  H.fieldLayout = { PER, RUNS, PADS, BLD, PICK, EMPTY4, PLEN, plans, planeAt, ghostPlan, ghostAt, camAt, FIELD_CAM, NIGHT_CAM };   // for the node check
})();
