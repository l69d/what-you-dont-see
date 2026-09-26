// The director. The film is a list of reels; each reel turns its own clock t into a picture (layers),
// words (cues in the frame), subtitles (the bar below), labels (numbers pinned to the drawing),
// sounds and interaction. Everything else is drawn by the engine.
function main() {
  "use strict";
  const H = window.HOLES, M = H.model;
  const Q = new URLSearchParams(location.search);
  const TALK = Q.has("talk"), FATE = Q.get("fate"), REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STILL = Q.get("still");   // "reel@seconds" renders one frame and stops (for screenshots)
  const $ = s => document.querySelector(s);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ez = x => (x = clamp(x), x * x * (3 - 2 * x));
  const ezo = x => 1 - Math.pow(1 - clamp(x), 3);
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const pulse = (t, at, k = 10) => t >= at ? Math.exp(-(t - at) * k) : 0;

  // sound: never let it break the picture
  const au = (k, ...a) => { try { const A = H.audio; if (A && A.ready && typeof A[k] === "function") A[k](...a); } catch (e) { console.warn(e); } };

  // ---------- data ----------
  const S = M.simulate(), ST = M.stats(S), f1 = v => v.toFixed(1);
  const RET = S.retHoles, LOST = S.lostHoles;
  let YOUR = S.sorties.find(s => !s.lost), CHOICE = -1;
  const ZONE_BUTTONS = [[1, "Wings and tail"], [2, "Fuselage"], [0, "Engines"]];
  const MID = (name, fb = 1) => { const m = H.mediaDefs.find(m => m.name === name); return m ? m.id : fb; };
  const INK = id => (H.mediaDefs.find(m => m.id === id) || {}).ink || "light";
  // a few media are painted dark (a hangar at night, old stone, wood); lift them for bright rooms
  const LIFT = { metal: 1.3, stone: 1.22, treerings: 1.2, sun: 1.1 };
  const lift = (L, P) => { if (L.scene !== 0) return; const m = H.mediaDefs.find(m => m.id === L.medium); if (m && LIFT[m.name]) P.exposure *= LIFT[m.name]; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // when lost holes land on the drawing (mirrors the hole vertex shader)
  const LOST_HOLES = S.holes.map((h, i) => ({ ...h, seed: (i * 0.6180339887) % 1 })).filter(h => h.lost);
  const landAt = h => h.ghost * .16 + ((h.seed * 7.3) % 1) * .45 + 1.5;

  // ---------- engine ----------
  const frameEl = $("#frame"), cv = $("#c");
  let E;
  try {
    E = new H.Engine(cv, { still: !!STILL });
    if (!E.build(M)) throw new Error(E.errors);
    E.setHoles(S.holes);
  } catch (e) {
    $("#fail").hidden = false; $("#fail pre").textContent = String(e.message || e);
    document.title = "error";
    return;
  }

  // ---------- layout: a 2.39:1 frame between black bars ----------
  const BASE = Q.has("hq") ? Math.min(2, devicePixelRatio || 1) : 1;
  let FW = 0, FH = 0, scale = +(Q.get("scale") || BASE), cap = 1;   // cap: the heaviest reels start a little softer
  function layout() {
    const vw = innerWidth, vh = innerHeight, minBar = vh < 560 ? 64 : 100;
    let fw = vw, fh = vw >= vh ? Math.round(vw / 2.39) : Math.round(vw / 1.15);
    if (fh > vh - 2 * minBar) { fh = Math.max(180, vh - 2 * minBar); if (vw >= vh) fw = Math.min(vw, Math.round(fh * 2.39)); }
    FW = fw; FH = fh;
    const r = document.documentElement.style;
    r.setProperty("--fw", fw + "px"); r.setProperty("--fh", fh + "px");
    E.resize(fw * Math.min(scale, cap), fh * Math.min(scale, cap));
  }
  addEventListener("resize", layout);
  layout();
  function openFrame() {
    const r = document.documentElement.style;
    frameEl.style.transition = "none"; r.setProperty("--open", 0);
    void frameEl.offsetWidth;
    frameEl.style.transition = ""; r.setProperty("--open", 1);
  }
  document.documentElement.style.setProperty("--open", 1);

  // ---------- camera helpers ----------
  function toScreen(L, w) {
    const c = L.cam, dx = w[0] - c[0], dy = w[1] - c[1], cs = Math.cos(c[3]), sn = Math.sin(c[3]);
    return [FW / 2 + (cs * dx + sn * dy) / c[2] * FH, FH / 2 - (-sn * dx + cs * dy) / c[2] * FH];
  }
  function toWorld(L, sx, sy) {
    const c = L.cam, qx = (sx - FW / 2) / FH, qy = (FH / 2 - sy) / FH, cs = Math.cos(c[3]), sn = Math.sin(c[3]);
    return [c[0] + (cs * qx - sn * qy) * c[2], c[1] + (sn * qx + cs * qy) * c[2]];
  }
  function toPlane(L, w) {
    const p = L.plane, dx = (w[0] - p[0]) / p[2], dy = (w[1] - p[1]) / p[2], cs = Math.cos(p[3]), sn = Math.sin(p[3]);
    return [cs * dx + sn * dy, -sn * dx + cs * dy];
  }

  // ---------- words, subtitles, labels, buttons ----------
  const wordsEl = $("#words"), subEl = $("#sub"), uiEl = $("#ui"), labelsEl = $("#labels"), trEl = $("#transcript");
  let cues = [], subs = [], subOverride = null, subShown = null, labs = [];
  const say = s => { trEl.textContent = s; };
  function ripple(x, y, soft) {
    for (const d of [0, 180, 420]) setTimeout(() => {
      const r = document.createElement("div"); r.className = "ring" + (soft ? " soft" : "");
      r.style.left = x + "px"; r.style.top = y + "px"; frameEl.appendChild(r);
      setTimeout(() => r.remove(), 1700);
    }, d);
  }
  function words(list, offset = 0) {
    for (const [a, b, text, cls = ""] of list) {
      const el = document.createElement("div");
      el.className = "w " + cls; el.textContent = text; el.style.opacity = 0;
      wordsEl.appendChild(el);
      cues.push({ a: a + offset, b: b + offset, text, cls, el, said: false });
    }
  }
  function endWord(cls, at) { for (const c of cues) if (c.cls.split(" ").includes(cls)) c.b = Math.min(c.b, at); }
  function drawWords(t, ink) {
    for (const c of cues) {
      const k = Math.min(seg(t, c.a, c.a + .75), 1 - seg(t, c.b - .6, c.b));
      if (k <= 0) { if (c.el.style.opacity !== "0") c.el.style.opacity = 0; continue; }
      const e = ezo(k);
      c.el.style.opacity = e.toFixed(3);
      c.el.style.filter = e > .99 ? "none" : `blur(${((1 - e) * 8).toFixed(2)}px)`;
      c.el.style.translate = `0 ${((1 - e) * 10).toFixed(1)}px`;
      c.el.classList.toggle("dark", ink === "dark" && !c.cls.includes("gold"));
      if (!c.said && k > .5) { c.said = true; say(c.text); }
    }
  }
  function drawSub(t) {
    let s = "";
    if (subOverride != null) s = subOverride;
    else for (const c of subs) if (t >= c.a && t < c.b) s = c.text;
    if (s !== subShown) { subShown = s; subEl.textContent = s; if (s) say(s); }
  }
  function labels(list) {
    labelsEl.textContent = "";
    labs = list.map(l => {
      const el = document.createElement("div");
      el.className = "lab " + (l.cls || "") + (l.below ? " below" : "");
      const stem = l.stem === false ? "" : "<i></i>";
      el.innerHTML = (l.below ? stem : "") + `<b>${l.big}</b>${l.small ? `<span>${l.small}</span>` : ""}` + (l.below ? "" : stem);
      labelsEl.appendChild(el);
      return { a: 0, b: 1e9, ...l, el };
    });
  }
  function drawLabels(L, t) {
    for (const l of labs) {
      const [x, y] = toScreen(L, typeof l.w === "function" ? l.w(t) : l.w);
      l.el.style.left = x.toFixed(1) + "px"; l.el.style.top = y.toFixed(1) + "px";
      l.el.classList.toggle("on", t >= l.a && t < l.b);
    }
  }
  let lastKeyboard = false;
  function ui(buttons) {
    uiEl.textContent = "";
    for (const b of buttons) {
      const el = document.createElement("button");
      el.type = "button"; el.className = b.cls || "";
      if (b.html) el.innerHTML = b.html; else el.textContent = b.label;
      if (b.onClick) el.addEventListener("click", e => { touch(); b.onClick(e); });
      if (b.onDown) { el.addEventListener("pointerdown", e => { touch(); e.preventDefault(); b.onDown(e); }); }
      uiEl.appendChild(el); b.el = el;
    }
    const primary = buttons.find(b => /primary/.test(b.cls || ""));
    if (primary && lastKeyboard) primary.el.focus({ preventScroll: true });
    return buttons;
  }

  // ---------- the controller ----------
  const film = { id: "", R: null, t: 0, clock: 0, cues: [], hold: false, lastInput: 0, L: H.layer() };
  const REELS = {};
  const ORDER = ["title", "open", "raid", "home", "count", "decide", "wald", "ghosts", "reveal", "echo", "credits"];
  function cue(t, fn) { film.cues.push({ t, fn, done: false }); }
  function go(id) {
    const R = REELS[id];
    if (!R) return;
    if (film.R && film.R.exit) film.R.exit();
    film.id = id; film.R = R; film.t = 0; film.cues = []; film.hold = false;
    cues = []; wordsEl.textContent = ""; subs = []; subOverride = null; ui([]); labels([]);
    $("#roll").classList.remove("on");
    $("#chapter").textContent = R.chapter || "";
    frameEl.className = "";
    if (R.words) words(R.words);
    if (R.subs) subs = R.subs.map(([a, b, text]) => ({ a, b, text }));
    if (R.cues) for (const [t, fn] of R.cues) cue(t, fn);
    if (R.enter) R.enter();
    if ((R.cap || 1) !== cap) { cap = R.cap || 1; layout(); }
  }
  const next = () => go(ORDER[ORDER.indexOf(film.id) + 1] || "title");
  // the last seconds of a reel can dissolve into the first frame of the next (burn, ink)
  function outro(R, t, P) {
    const nx = REELS[ORDER[ORDER.indexOf(film.id) + 1]], D = dur(R);
    if (!R.outro || !nx || D - t > R.outro) return null;
    const B = H.layer();
    nx.layers(0, B, H.post(), 0);
    P.mix = ez(1 - (D - t) / R.outro); P.trans = R.outroTrans || 1;
    return B;
  }
  const touch = () => { film.lastInput = film.clock; };
  const dur = R => typeof R.dur === "function" ? R.dur() : R.dur;

  // ---------- reel: title ----------
  let compiling = null, compiled = false;   // the shaders compile in the background while the title shows
  REELS.title = {
    words: [[0, 1e9, "What We Don’t See", "big mid"]],
    subs: [[0, 1e9, "A short film you play. About four minutes, with sound."]],
    enter() {
      const [b] = ui([{ label: "Begin", cls: "primary", onClick: begin }]);
      if (compiled) return;
      b.el.disabled = true; b.el.textContent = "Preparing the film";
      compiling = compiling || E.compileAll((d, n) => { if (b.el.isConnected && !compiled) b.el.textContent = `Preparing the film ${Math.round(d / n * 100)}%`; });
      compiling.then(err => {
        compiled = true;
        if (err) { $("#fail").hidden = false; $("#fail pre").textContent = err; document.title = "error"; return; }
        if (b.el.isConnected) { b.el.disabled = false; b.el.textContent = "Begin"; if (lastKeyboard) b.el.focus({ preventScroll: true }); }
      });
    },
    waiting: () => false,
    layers(t, L, P) {
      L.scene = 0; L.medium = MID("nightlimb"); L.shape = 0; L.arc = [-.26, 3.4, 0];
      L.cam = [Math.sin(film.clock * .05) * .03, .04, 1.02 - .02 * Math.sin(film.clock * .07), 0];
      P.exposure = .95; P.fade = 1 - seg(t, 0, 2);
    },
  };
  function begin() {
    try { if (H.audio && H.audio.init) H.audio.init().catch(() => {}); } catch (e) { /* silent film */ }
    YOUR = M.pickSortie(S, Math.random, FATE);
    CHOICE = -1;
    go(Q.get("at") || "open");
  }

  // ---------- reel: the cold open ----------
  const MONTAGE = ["blueprint", "metal", "embroidery", "thermal", "halftone", "stainedglass", "cells", "collage", "engraving",
    "constellation", "ink", "xray", "sun", "topo", "kintsugi", "record", "treerings", "coin"];
  function schedule(names, t0, t1, d0, d1) {
    let ids = names.map(n => MID(n, -1)).filter(i => i >= 0);
    if (!ids.length) ids = [1];
    const d = ids.map((_, i) => lerp(d0, d1, ids.length > 1 ? i / (ids.length - 1) : 0)), k = (t1 - t0) / d.reduce((a, b) => a + b);
    let a = t0;
    return ids.map((id, i) => { const s = { a, b: a + d[i] * k, id, i }; a = s.b; return s; });
  }
  const shotAt = (list, t) => list.find(s => t >= s.a && t < s.b) || list[list.length - 1];
  let OPEN = [];
  REELS.open = {
    words: [[1.2, 3.1, "1943."], [3.3, 5.5, "Every plane"], [5.5, 7.8, "that comes home"], [7.8, 9.7, "brings back"],
      [9.7, 11.9, "a story."], [14.6, 19.4, "What We Don’t See", "big mid"]],
    dur: 21,
    enter() {
      OPEN = schedule(MONTAGE, 3.2, 11.6, REDUCED ? .9 : .7, REDUCED ? .9 : .34);
      openFrame();
      au("mood", "dawn", 4);
      for (const s of OPEN) cue(s.a, () => au("tick"));
      cue(9.1, () => au("riser", 2.6)); cue(11.7, () => au("boom")); cue(14.6, () => au("bell", 0));
      cue(19.2, () => au("mood", "silence", 2));
    },
    layers(t, L, P) {
      L.scene = 0; L.shape = 0; L.cam = [0, 0, 1, 0]; L.arc = [-.2, 3.2, 0];
      if (t < 3.2) { L.medium = MID("limb"); L.cam[2] = lerp(1.12, 1, ez(t / 3.2)); }
      else if (t < 11.6) {
        const s = shotAt(OPEN, t);
        L.medium = s.id; L.arc = [-.17 + (hash(s.i) - .5) * .07, 2.1 + hash(s.i + 9) * 3, 0];
        L.cam = [(hash(s.i + 3) - .5) * .05, 0, lerp(1, .84, seg(t, 3.2, 11.6)), 0];
        P.flash = REDUCED ? 0 : .08 * pulse(t, s.a, 22);
      } else {
        L.medium = MID("limb"); L.shape = ez(seg(t, 11.9, 14.3));
        L.cam = [0, lerp(0, .04, ez(seg(t, 11.7, 14.6))), lerp(1, 1.95, ez(seg(t, 11.7, 14.6))), 0];
        if (t > 14.4) P.exposure = lerp(1, .8, seg(t, 14.4, 15.6));
      }
      P.fade = Math.max(1 - seg(t, 0, 2.4), seg(t, 19.3, 21));
    },
  };

  // ---------- reel: the raid (scene 1) ----------
  let claimAt = null;
  const SKY_BEATS = { flak: 0, fighters: 6, otherHit: 9, yourHits: [], fatal: null, drop: null, turn: 22, end: 32 };
  const skyBeats = () => Object.assign({}, SKY_BEATS, (H.scenes.sky && H.scenes.sky.beats) || {});
  REELS.raid = {
    chapter: "I. The raid",
    outro: 1.8, outroTrans: 5,
    words: [[.8, 3.2, "Over Germany."], [3.4, 6.1, "On the worst raids of 1943,"], [6.1, 8.2, "one bomber in six"],
      [8.2, 10.6, "doesn’t come home."], [10.9, 13.3, "Ten men in each."], [13.5, 1e9, "This one is yours.", "claim"]],
    enter() { claimAt = null; au("mood", "dawn", 2); au("engines", .7, 0); au("wind", .3); },
    dur: () => claimAt == null ? 1e9 : claimAt + skyBeats().end,
    waiting: t => claimAt == null && t > 13.5,
    layers(t, L, P) {
      const sky = H.scenes.sky;
      if (sky) { L.scene = 1; sky.update(t, L, E, { sim: S, your: YOUR, claimAt, reduced: REDUCED }); }
      else { L.scene = 0; L.medium = MID("limb"); L.shape = 1; L.cam = [0, 0, 1.9, 0]; }
      P.fade = 1 - seg(t, 0, 1.6);
      if (claimAt != null) {
        const c = t - claimAt, b = skyBeats();
        for (const h of b.yourHits || []) P.flash += .2 * pulse(c, h, 12);
        if (b.fatal != null) P.flash += .3 * pulse(c, b.fatal, 6);
        P.aberr = .0015 + .0025 * seg(c, b.fighters, b.fighters + 4) * (1 - seg(c, b.turn, b.turn + 4));
        if (REDUCED) P.flash *= .3;
      }
    },
    tick(t) {
      if (claimAt == null && t > 13.5) {
        subOverride = "Click your plane to take your seat.";
        if (t > 25.5) claim();
      }
    },
    move(x, y) { frameEl.className = claimAt == null && film.t > 13.5 && onYourPlane(x, y) ? "pointer" : ""; },
    down(x, y) { if (claimAt == null && film.t > 12 && onYourPlane(x, y)) claim(); },
    key(k) { if (claimAt == null && film.t > 12 && (k === " " || k === "Enter")) { claim(); return true; } },
  };
  function onYourPlane(x, y) {
    const s = H.scenes.sky && H.scenes.sky.state && H.scenes.sky.state.your;
    if (!s) return true;
    const [sx, sy] = toScreen(film.L, [s.x, s.y]);
    return Math.hypot(x - sx, y - sy) < Math.max(44, s.r / film.L.cam[2] * FH * 1.25);
  }
  function claim() {
    claimAt = film.t; subOverride = null; frameEl.className = "";
    endWord("claim", claimAt + .4);
    au("claim");
    const s = H.scenes.sky && H.scenes.sky.state && H.scenes.sky.state.your;
    if (s) { const [sx, sy] = toScreen(film.L, [s.x, s.y]); ripple(sx, sy); } else ripple(FW / 2, FH / 2);
    const b = skyBeats(), c0 = claimAt, hits = b.yourHits || [], lastHit = hits.length ? hits[hits.length - 1] : 18;
    subs.push({ a: c0 + b.flak + .6, b: c0 + b.flak + 5, text: "Twenty-five thousand feet. Flak." },
      { a: c0 + b.fighters + .3, b: c0 + b.fighters + 3, text: "Fighters, twelve o’clock." },
      { a: c0 + b.otherHit + 1.2, b: c0 + b.otherHit + 4.6, text: "The plane on your left is going down. Ten men." });
    if (hits.length) subs.push({ a: c0 + hits[0], b: c0 + hits[0] + 2.6, text: "You’re hit." });
    if (YOUR.lost) {
      const z = YOUR.hits[YOUR.fatal] ? YOUR.hits[YOUR.fatal].z : 0;
      if (b.fatal != null) subs.push({ a: c0 + b.fatal + .5, b: c0 + b.fatal + 3.4, text: z === 0 ? "An engine is on fire." : "You’re on fire." });
      const d = b.drop != null ? b.drop : 19;
      subs.push({ a: c0 + d + .2, b: c0 + d + 3.6, text: "You’re falling out of formation." }, { a: c0 + d + 3.8, b: c0 + d + 7.5, text: "Your crew bails out." });
      words([[b.turn + .8, b.turn + 5.6, "Your plane won’t come home.", "mid"]], c0);
    } else {
      subs.push({ a: c0 + lastHit + 1.2, b: c0 + lastHit + 4, text: "Still flying." });
      words([[b.turn + .6, b.turn + 5, "Turning for home.", "mid"]], c0);
    }
    // sound: flak builds, fighters scream through, your hits land, then the turn for home
    for (let i = 0; i < 30; i++) {
      const at = b.flak + (b.turn - b.flak) * Math.pow(i / 30, .8) + hash(i) * .4;
      cue(c0 + at, () => au("flak", hash(i + 40) * 2 - 1, hash(i + 80) * .8));
    }
    for (const k of [.3, 1.1, 1.8, 2.6]) cue(c0 + b.fighters + k, () => au("fighter", hash(k * 9) * 2 - 1));
    cue(c0 + b.otherHit, () => au("boom"));
    for (const h of hits) cue(c0 + h, () => au("hit", 0));
    cue(c0 + b.flak, () => au("tension", .35)); cue(c0 + b.fighters, () => au("tension", .7));
    if (hits.length) cue(c0 + hits[0], () => au("tension", 1));
    if (YOUR.lost && b.fatal != null) { cue(c0 + b.fatal, () => { au("boom"); au("fire", .8); }); cue(c0 + (b.drop ?? 19), () => au("whoosh")); }
    cue(c0 + b.turn, () => { au("tension", 0); au("mood", YOUR.lost ? "silence" : "dawn", 4); if (YOUR.lost) au("fire", 0); });
    cue(c0 + b.end - 1.4, () => { au("engines", 0); au("wind", 0); au("fire", 0); });
  }

  // ---------- reel: home (scene 2) ----------
  const FIELD_BEATS = { firstLanding: 2, yourLanding: 9, lastLanding: 14, pushIn: 15, end: 20 };
  REELS.home = {
    chapter: "II. Home",
    cap: .85,
    outro: 1.6, outroTrans: 1,
    words: [[.8, 3.6, "England, that afternoon."], [4.2, 6.8, "They come home"], [6.8, 9.4, "one by one."], [12.6, 15.2, "Some don’t."],
      [18.2, 21.4, "250 of 300 came home.", "mid"]],
    dur: 21.5,
    enter() {
      const b = Object.assign({}, FIELD_BEATS, (H.scenes.field && H.scenes.field.beats) || {});
      au("mood", "home", 3); au("engines", .45, 0);
      if (!YOUR.lost && b.yourLanding != null) subs.push({ a: b.yourLanding + .4, b: b.yourLanding + 4, text: `Your plane lands with ${plural(YOUR.hits.length, "hole")} in it.` });
      subs.push({ a: 15.3, b: 18, text: YOUR.lost ? "One of the empty hardstands is yours." : "The ground crews wait for the rest." });
      cue(12.6, () => au("bell", -5)); cue(18.2, () => au("motif", 0));
    },
    layers(t, L, P) {
      const f = H.scenes.field;
      if (f) { L.scene = 2; f.update(t, L, E, { sim: S, your: YOUR, reduced: REDUCED }); }
      else { L.scene = 0; L.medium = MID("collage"); L.shape = 1; L.cam = [0, 0, 1.9, 0]; }
      P.fade = 1 - seg(t, 0, 1.2);
    },
    tick(t) {
      const f = H.scenes.field, landed = f && f.state && f.state.landed != null ? f.state.landed : Math.floor(seg(t, 2, 14) * 30);
      if (t > 2 && t < 15.2 && !subs.some(s => t >= s.a && t < s.b)) subOverride = `${Math.round(landed / 30 * 250)} of 300 home`;
      else subOverride = null;
      au("engines", .45 * (1 - landed / 30), 0);
    },
  };

  // ---------- reel: the count (scene 0, press and hold) ----------
  const COUNT = { intro: 3.4, hold: 14, cuts: ["metal", "embroidery", "halftone", "stainedglass", "cells", "collage", "engraving",
    "constellation", "ink", "xray", "blueprint", "thermal"] };
  const COUNT_END = COUNT.intro + COUNT.hold;
  const P2W = (L, x, y) => { const p = L.plane; return [p[0] + x * p[2], p[1] + y * p[2]]; };
  // holes per plane, pinned to the parts of one plane (the plane at the origin, scale 1)
  function zoneLabels(a) {
    return [
      { w: [.8, .15], big: f1(ST[1].back), small: "Wings and tail", a },
      { w: [.36, -.4], big: f1(ST[2].back), small: "Fuselage", a: a + .25 },
      { w: [-.49, .4], big: f1(ST[0].back), small: "Engines", a: a + .5 },
    ];
  }
  // the reveal: the engine number is the hero; the rest sits under each copy
  function revealLabels(a, split) {
    const line = w => `Per plane: wings and tail ${f1(ST[1][w])}, fuselage ${f1(ST[2][w])}, engines ${f1(ST[0][w])}.`;
    return [
      { w: [-.49 - split, .4], big: f1(ST[0].back), small: "engine holes per plane", cls: "big", a: a + .4 },
      { w: [-.49 + split, .4], big: f1(ST[0].lost), small: "engine holes per plane", cls: "big gold", a: a + .9 },
      { w: [-split, -.76], big: "Came home", small: `250 planes. ${line("back")}`, cls: "title", below: true, stem: false, a },
      { w: [split, -.76], big: "Never came back", small: `50 planes. ${line("lost")}`, cls: "title", below: true, stem: false, a },
    ];
  }
  let countShown = 0;
  REELS.count = {
    chapter: "III. The count",
    words: [[.5, 2.2, "In the hangars,", "top"], [2.2, 4.2, "they count every hole.", "top"], [4.6, 7.8, "Every hole", "top"], [7.8, 11.2, "on every plane", "top"],
      [11.2, 15, "that came home.", "top"], [18.8, 22.6, "The pattern looks clear.", "top"]],
    subs: [[18, 27, "Holes per plane, averaged over the 250 planes that came home."]],
    dur: 27,
    rate: t => (t < COUNT.intro || t >= COUNT_END) ? 1 : film.hold ? 1 : 0,
    waiting: t => t >= COUNT.intro && t < COUNT_END && !film.hold,
    enter() {
      countShown = 0;
      au("mood", "hangar", 2.5); au("engines", 0);
      const n = COUNT.cuts.length, len = COUNT.hold / n;
      for (let i = 1; i < n; i++) cue(COUNT.intro + i * len, () => au("tick"));
      cue(COUNT_END, () => { ui([]); au("bell", 0); film.hold = false; });
      cue(17.8, () => labels(zoneLabels(17.9)));
      if (!YOUR.lost) subs.push({ a: 22.8, b: 27, text: `Your plane’s ${plural(YOUR.hits.length, "hole")} are in there too, in gold.` });
      cue(COUNT.intro, () => {
        ui([{ html: `<svg viewBox="0 0 26 26" aria-hidden="true"><circle class="track" cx="13" cy="13" r="11"/><circle class="fill" cx="13" cy="13" r="11"/></svg>Hold to count`,
          cls: "hold primary", onDown: () => { film.hold = true; } }]);
      });
    },
    layers(t, L, P) {
      const k = clamp(t - COUNT.intro, 0, COUNT.hold), done = t >= COUNT_END;
      const n = COUNT.cuts.length, cut = Math.min(n - 1, Math.floor(k / (COUNT.hold / n)));
      L.scene = 0; L.shape = 1;
      L.medium = t < COUNT.intro ? MID("metal") : MID(COUNT.cuts[done ? n - 1 : cut]);
      L.holes.ret = Math.floor(RET * Math.pow(k / COUNT.hold, 1.35));
      L.holes.fresh = film.hold || done ? 1 : .35; L.holes.gain = .12;
      L.holes.your = YOUR.lost ? -1 : YOUR.id;
      const e = ez(seg(t, COUNT_END, COUNT_END + 2.5)), z = lerp(2.1, 1.86, ez(k / COUNT.hold));
      L.cam = [lerp(.03 * Math.sin(k * .5), 0, e), lerp(.09, .1, e), lerp(z, 2, e), lerp(.035 * Math.sin(k * .37), 0, e)];
      if (!REDUCED && t >= COUNT.intro && !done) P.flash = .07 * pulse(k % (COUNT.hold / n), 0, 20);
      countShown = L.holes.ret;
    },
    tick(t) {
      if (t >= COUNT.intro && t < COUNT_END) {
        subOverride = film.hold ? `${countShown} holes` : countShown ? "Hold to keep counting." : "Press and hold, anywhere, to count the holes.";
        const b = uiEl.querySelector("button.hold");
        if (b) b.style.setProperty("--k", ((t - COUNT.intro) / COUNT.hold).toFixed(3));
      } else subOverride = null;
      if (countShown > this._last) au("stamp", countShown);
      this._last = countShown;
    },
    _last: 0,
    down() { if (film.t >= COUNT.intro && film.t < COUNT_END) film.hold = true; },
    up() { film.hold = false; },
    key(k, down) { if (k === " " || k === "Enter") { if (film.t >= COUNT.intro && film.t < COUNT_END) film.hold = down; return true; } },
  };

  // ---------- reel: the decision ----------
  let hover = -1, hoverK = 0, choiceAt = null;
  REELS.decide = {
    chapter: "IV. The decision",
    words: [[.5, 2.9, "Armour is heavy.", "top"], [2.9, 5.7, "A bomber can carry only a little.", "top"], [5.9, 1e9, "Where does it go?", "top ask"]],
    enter() {
      hover = -1; hoverK = 0; choiceAt = null; CHOICE = -1;
      au("mood", "decision", 2);
      labels(zoneLabels(0));
      cue(5.9, () => {
        subOverride = "Click a part of the plane.";
        ui(ZONE_BUTTONS.map(([z, name]) => ({ label: name, onClick: () => choose(z) })));
      });
    },
    dur: () => choiceAt == null ? 1e9 : choiceAt + 5.6,
    waiting: t => choiceAt == null && t > 6,
    layers(t, L, P) {
      L.scene = 0; L.shape = 1; L.medium = MID("thermal");
      L.holes.ret = RET; L.holes.gain = .12; L.holes.your = YOUR.lost ? -1 : YOUR.id;
      L.fx2 = [hover, hoverK, 1, 0];
      L.cam = [0, .1, 2, 0];
      if (choiceAt != null) {
        const e = ez(seg(t, choiceAt, choiceAt + 2.4)), zc = [[-.37, .24], [-.62, .05], [0, .1]][CHOICE];
        L.fx = [1, 0, CHOICE, ez(seg(t, choiceAt + .15, choiceAt + 1.9))];
        L.cam = [zc[0] * .3 * e, lerp(.1, .1 + zc[1] * .3, e), lerp(2, 1.7, e), 0];
        P.fade = seg(t, choiceAt + 4.8, choiceAt + 5.6);
      }
    },
    tick(t, dt) { hoverK += ((hover >= 0 ? 1 : 0) - hoverK) * Math.min(1, dt * 8); },
    move(x, y) {
      if (choiceAt != null || film.t < 5.9) return;
      const w = toWorld(film.L, x, y), pl = toPlane(film.L, w), z = M.zoneAt(pl[0], pl[1]);
      if (z !== hover) { hover = z; if (z >= 0) au("tick"); }
      frameEl.className = z >= 0 ? "pointer" : "";
    },
    down(x, y) {
      if (choiceAt != null || film.t < 5.9) return;
      const w = toWorld(film.L, x, y), pl = toPlane(film.L, w), z = M.zoneAt(pl[0], pl[1]);
      if (z >= 0) choose(z);
    },
    key(k) { if (choiceAt == null && film.t > 5.9 && "123".includes(k) && k.length === 1) { choose(ZONE_BUTTONS[+k - 1][0]); return true; } },
  };
  function choose(z) {
    CHOICE = z; choiceAt = film.t; hover = z; hoverK = 1;
    { const c = [[-.37, .24], [-.62, .05], [0, .1]][z], [sx, sy] = toScreen(film.L, [c[0], c[1]]); ripple(sx, sy); }
    ui([]); subOverride = null; frameEl.className = "";
    endWord("ask", choiceAt + .3);
    if (z === 0) { words([[.6, 4.8, "The part with the fewest holes.", "top"]], choiceAt); subs.push({ a: choiceAt + 1, b: choiceAt + 5.6, text: "An unusual choice. Why there?" }); }
    else { words([[.6, 4.8, "Where the holes are.", "top"]], choiceAt); subs.push({ a: choiceAt + 1, b: choiceAt + 5.6, text: "Most people choose the same." }); }
    for (const k of [.35, .85, 1.35]) cue(choiceAt + k, () => au("clink"));
    cue(choiceAt + 2, () => au("bell", z === 0 ? 7 : 0));
  }

  // ---------- reel: Wald's question ----------
  let showAt = null;
  REELS.wald = {
    chapter: "V. The question",
    words: [[1, 3.2, "In New York,", "mid"], [3.2, 6.1, "a mathematician named Abraham Wald", "mid"], [6.1, 8.6, "looked at the same numbers.", "mid"],
      [9, 11.4, "He asked a different question.", "mid"], [11.8, 13.6, "Where are the holes", "mid big"], [13.6, 15.4, "on the planes", "mid big"],
      [15.4, 1e9, "that didn’t come back?", "mid big q"]],
    enter() {
      showAt = null;
      au("mood", "wald", 2);
      cue(11.6, () => au("heartbeat")); cue(13.4, () => au("heartbeat")); cue(15, () => au("riser", 3));
      cue(16.4, () => ui([{ label: "Show me", cls: "primary", onClick: show }]));
      cue(24, () => show());
    },
    dur: () => showAt == null ? 1e9 : showAt + 1.3,
    waiting: t => showAt == null && t > 16.4,
    layers(t, L, P) {
      L.scene = 0; L.medium = MID("nightlimb"); L.shape = 0; L.arc = [-.3, 3.6, 0]; L.cam = [0, 0, 1, 0];
      P.exposure = .45; P.fade = Math.max(1 - seg(t, 0, 1), showAt == null ? 0 : seg(t, showAt, showAt + 1.2));
    },
    key(k) { if (showAt == null && film.t > 16.4 && (k === " " || k === "Enter")) { show(); return true; } },
  };
  function show() { if (showAt != null) return; showAt = film.t; ui([]); endWord("q", showAt + .6); au("boom"); ripple(FW / 2, FH / 2, true); }

  // ---------- reel: the ghosts rise (scene 3) ----------
  REELS.ghosts = {
    chapter: "VI. The missing",
    cap: .8,
    words: [[3.8, 7, "Fifty planes never came home."], [8.4, 11.4, "Nobody could count their holes."], [12, 15.2, "Wald imagined them."]],
    dur: 16,
    enter() {
      au("mood", "reveal", 3);
      for (let i = 0; i < 7; i++) cue(.8 + i * .45, () => au("bell", i * 2));
      cue(3, () => au("whoosh"));
    },
    layers(t, L, P) {
      const n = H.scenes.night;
      if (n) { L.scene = 3; n.update(t, L, E, { sim: S, your: YOUR, reduced: REDUCED }); }
      else { L.scene = 0; L.medium = MID("nightlimb"); L.shape = 1; L.cam = [0, 0, 1.9, 0]; L.fx2 = [-1, 0, 1, 50]; }
      P.fade = 1 - seg(t, 0, 1.2);
      if (t > 14.4) {   // bleed into the reveal like ink
        const B = H.layer();
        REELS.reveal.layers(0, B, H.post());
        P.mix = ez(seg(t, 14.4, 16)); P.trans = 1;
        return B;
      }
    },
  };

  // ---------- reel: the reveal (scene 0, split in two) ----------
  const GX = 1.15;
  // a loose formation of fifty, rows staggered like a bomber stream
  const ghostHome = i => { const r = Math.floor(i / 10), c = i % 10; return [GX + (c - 4.5) * .3 + (r % 2 ? .15 : 0) + (hash(i) - .5) * .05, 1.02 + r * .21 + (hash(i + 50) - .5) * .05]; };
  REELS.reveal = {
    chapter: "VI. The missing",
    words: [[12.6, 15, "The engines.", "top big"], [15.4, 17.9, "Planes hit in the engines", "top"], [17.9, 20.6, "didn’t come home.", "top"],
      [21.2, 23.4, "The holes you can see", "top"], [23.4, 25.6, "are where a plane can be hit", "top"], [25.6, 28.2, "and still fly home.", "top"]],
    subs: [[14.2, 21, "Holes per plane. Left: the 250 that came home. Right: the 50 that didn’t, as Wald imagined them."]],
    dur: 36,
    enter() {
      au("mood", "reveal", 1);
      for (const h of LOST_HOLES) cue(4 + landAt(h), () => au("stamp", h.order));
      cue(12.6, () => au("boom"));
      [15.4, 17.9, 21.2, 25.6].forEach((t, i) => cue(t, () => au("motif", i)));
      cue(13.6, () => labels(revealLabels(13.7, GX)));
      if (CHOICE === 0) {
        words([[28.6, 31, "You chose the engines.", "top gold"], [31, 34.6, "So did Wald.", "top gold"]]);
        for (const k of [28.6, 29.1, 29.6]) cue(k, () => au("clink"));
        cue(31, () => au("bell", 12));
      } else {
        words([[29.2, 31.2, "Wald’s answer:", "top"], [31.2, 34.6, "armour the engines.", "top gold"]]);
        for (const k of [30.8, 31.3, 31.8]) cue(k, () => au("clink"));
        cue(32.4, () => au("bell", 12));
      }
    },
    layers(t, L, P) {
      L.scene = 0; L.shape = 1; L.medium = MID("thermal");
      const e = ez(seg(t, .5, 3.2));
      L.split = GX * e;
      // up to watch the ghosts, then down to the two drawings
      const up = ez(seg(t, .5, 3.4)), back = ez(seg(t, 11, 13.5));
      L.cam = [lerp(.45 * up, 0, back), lerp(.62 * up, .05, back), lerp(lerp(1.9, 2.95, e), 2.55, back), 0];
      L.holes.ret = RET; L.holes.lost = LOST; L.holes.fall = t - 4; L.holes.gain = .12;
      L.holes.your = YOUR.id;
      L.fx = [1, 5, -1, 0];
      L.fx2 = [-1, 0, 1, 50];
      // the ghosts: descend into view, release their holes one after another, then fade upward
      for (let i = 0; i < 50; i++) {
        const [x, y] = ghostHome(i), rel = 4 + i * .16, down = 1 - ez(seg(t, 1.2, 4.2));
        E.dataRow(8, i, x + Math.sin(film.clock * .7 + i) * .01, y + down * 1.3 + seg(t, rel + 1.4, rel + 3) * .25, Math.sin(film.clock * .5 + i * 1.7) * .05, .105);
        E.dataRow(9, i, ez(seg(t, 1.2, 3)) * (1 - seg(t, rel + 1.3, rel + 3)), 1 + .5 * Math.sin(film.clock * 2 + i), YOUR.lost && YOUR.ghost === i ? 1 : 0, 0);
      }
      // the armour, at the end
      if (t > 28) {
        if (CHOICE === 0) L.fx = [1, 5, 0, ez(seg(t, 28.4, 30.2))];
        else if (CHOICE > 0 && t < 30.4) L.fx = [1, 5, CHOICE, ez(seg(t, 28.1, 29.2)) * (1 - ez(seg(t, 29.5, 30.4)))];
        else L.fx = [1, 5, 0, ez(seg(t, 30.5, 32.3))];
        P.flash = .18 * pulse(t, CHOICE === 0 ? 30.2 : 32.3, 5);
      }
      P.fade = seg(t, 34.8, 36);
    },
  };

  // ---------- reel: the echo ----------
  const ECHO = [
    { a: 2.8, b: 6.9, m: "stone", w: "The old buildings still standing", s: "The badly built ones fell down long ago." },
    { a: 6.9, b: 11, m: "record", w: "The old songs we still play", s: "The forgettable ones faded away." },
    { a: 11, b: 15.1, m: "coin", w: "The fortunes we hear about", s: "Most who tried the same thing went broke." },
    { a: 15.1, b: 19.2, m: "treerings", w: "The oldest trees", s: "The weak ones fell." },
  ];
  REELS.echo = {
    chapter: "VII. Everywhere",
    words: [[.5, 2.7, "It isn’t only planes.", "mid"], ...ECHO.map(e => [e.a + .3, e.b - .1, e.w]),
      [19.6, 21.8, "Every story you hear"], [21.8, 23.8, "comes from someone"], [23.8, 26.2, "who came home."],
      [26.8, 31.6, "Look for the holes you can’t see.", "big mid"]],
    subs: [...ECHO.map(e => [e.a + .6, e.b, e.s]), [27.2, 32.5, "Survivorship bias. Abraham Wald, Statistical Research Group, New York, 1943."]],
    dur: 32.5,
    enter() {
      au("mood", "echo", 2);
      for (const e of ECHO) cue(e.a, () => au("tick"));
      cue(19.2, () => au("bell", 0)); cue(26.8, () => au("motif", 3));
    },
    layers(t, L, P) {
      L.scene = 0; L.shape = 0; L.cam = [0, 0, 1, 0];
      const e = ECHO.find(e => t >= e.a && t < e.b);
      if (e) { const i = ECHO.indexOf(e); L.medium = MID(e.m); L.arc = [-.19, 2.6 + i * .5, 0]; L.cam[2] = lerp(1.04, .9, seg(t, e.a, e.b)); P.flash = REDUCED ? 0 : .06 * pulse(t, e.a, 18); }
      else { L.medium = MID("nightlimb"); L.arc = [-.24, 3.4, 0]; L.cam[2] = lerp(1.05, .96, seg(t, 19.2, 32.5)); }
      P.fade = Math.max(t < 2.8 ? 1 : 0, seg(t, 31.4, 32.5));
    },
  };

  // ---------- reel: the credits ----------
  REELS.credits = {
    words: [[1, 3.6, "This wasn’t a video.", "mid"], [4, 6.6, "Every frame you just watched", "mid"], [6.6, 9.6, "was drawn live, by code, in your browser.", "mid"],
      [10, 12.8, "No footage. No images. No libraries.", "mid"], [13.4, 17.2, "Written with Claude.", "mid big gold"]],
    dur: () => 1e9,
    waiting: t => t > 19,
    enter() {
      au("mood", "credits", 3);
      cue(13.4, () => au("motif", 0));
      cue(17.4, rollCredits);
    },
    layers(t, L, P) {
      L.scene = 0; L.medium = MID("nightlimb"); L.shape = 0; L.arc = [-.34, 3.8, 0];
      L.cam = [0, 0, 1, 0]; P.exposure = lerp(.35, .55, seg(t, 17, 22)); P.fade = 1 - seg(t, 0, 1);
    },
    tick(t) {
      const pre = $("#roll pre");
      if (pre && t > 17.4) pre.style.transform = `translateY(${(FH - ((t - 17.4) * 28) % (pre.offsetHeight + FH)).toFixed(1)}px)`;
    },
  };
  function rollCredits() {
    const glsl = E.fsScene, lines = glsl.split("\n").length;
    $("#roll pre").textContent = glsl;
    const yours = YOUR.lost ? "Your plane was lost over Germany." : `Your plane came home with ${plural(YOUR.hits.length, "hole")}.`;
    const chose = CHOICE < 0 ? "" : ` You armoured the ${["engines", "wings and tail", "fuselage"][CHOICE]}.`;
    $("#roll .credits").innerHTML =
      `<p>What We Don’t See</p>` +
      `<p>Directed by you<small>${yours}${chose}</small></p>` +
      `<p>Written, drawn and scored with Claude<small>${lines.toLocaleString()} lines of shader code, one synthesizer, no footage.</small></p>` +
      `<p>The reasoning is Abraham Wald’s<small>Statistical Research Group, 1943. The 300 sorties and their holes are an illustrative simulation.</small></p>`;
    $("#roll").classList.add("on");
    ui([{ label: "Watch again", cls: "primary", onClick: () => { YOUR = M.pickSortie(S, Math.random, FATE); CHOICE = -1; go("open"); } },
      { label: "Back to the title", onClick: () => go("title") }]);
  }

  // ---------- input ----------
  const local = e => { const r = frameEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  frameEl.addEventListener("pointerdown", e => { touch(); lastKeyboard = false; const [x, y] = local(e); if (film.R.down) film.R.down(x, y, e); });
  frameEl.addEventListener("pointermove", e => { const [x, y] = local(e); if (film.R.move) film.R.move(x, y, e); });
  addEventListener("pointerup", () => { if (film.R.up) film.R.up(); film.hold = false; });
  addEventListener("pointercancel", () => { film.hold = false; });
  addEventListener("blur", () => { film.hold = false; });
  addEventListener("keydown", e => {
    touch(); lastKeyboard = true;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") { toggleSound(); return; }
    if (TALK && e.key === "ArrowRight") { next(); return; }
    if (TALK && e.key === "ArrowLeft") { go(ORDER[Math.max(0, ORDER.indexOf(film.id) - 1)]); return; }
    if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ") && !uiEl.querySelector("button.hold")) return;   // let the focused button click
    if (film.R.key && film.R.key(e.key, true)) { e.preventDefault(); return; }
    if (e.key === " " || e.key === "Enter") {
      const b = uiEl.querySelector("button.primary") || uiEl.querySelector("button");
      if (b && !b.classList.contains("hold")) { e.preventDefault(); b.click(); }
    }
  });
  addEventListener("keyup", e => { if (film.R.key) film.R.key(e.key, false); });

  const soundBtn = $("#sound");
  function toggleSound() {
    const A = H.audio, off = !(A && A.muted);
    if (A && A.setMute) A.setMute(off);
    soundBtn.textContent = off ? "Sound off" : "Sound on";
    soundBtn.setAttribute("aria-pressed", String(!off));
  }
  soundBtn.addEventListener("click", toggleSound);

  // ---------- the loop ----------
  const ptr = [0, 0], par = [0, 0];
  addEventListener("pointermove", e => { ptr[0] = e.clientX / innerWidth * 2 - 1; ptr[1] = e.clientY / innerHeight * 2 - 1; });
  let last = performance.now(), ftAvg = 16, lastAdjust = 0;
  function frame(now) {
    const dtms = Math.min(100, now - last), dt = dtms / 1000;
    last = now;
    film.clock += dt;
    const R = film.R;
    film.t += dt * (R.rate ? R.rate(film.t) : 1);
    for (const c of film.cues) if (!c.done && film.t >= c.t) { c.done = true; try { c.fn(); } catch (e) { console.error(e); } }
    if (film.R !== R) { requestAnimationFrame(frame); return; }
    const L = H.layer(), P = H.post();
    if (REDUCED) P.weave = 0;
    const B = R.layers(film.t, L, P, dt) || outro(R, film.t, P);
    lift(L, P);
    // a little parallax with the pointer, so the frame feels like a lens you can lean into
    if (!REDUCED) {
      par[0] += (ptr[0] - par[0]) * Math.min(1, dt * 2.5); par[1] += (ptr[1] - par[1]) * Math.min(1, dt * 2.5);
      for (const X of B ? [L, B] : [L]) { X.cam[0] += par[0] * .014 * X.cam[2]; X.cam[1] -= par[1] * .009 * X.cam[2]; }
    }
    film.L = L;
    if (R.tick) R.tick(film.t, dt, L);
    E.render(L, B, P, film.clock);
    drawWords(film.t, L.scene === 0 ? INK(L.medium) : "light");
    drawSub(film.t);
    drawLabels(L, film.t);
    if (film.t >= dur(R)) next();
    // an unattended booth returns to the title
    // (measured from when the film started waiting, not from the last click)
    const waiting = !!(R.waiting && R.waiting(film.t));
    if (!waiting) film.waitStart = 0; else if (!film.waitStart) film.waitStart = film.clock;
    if (!TALK && film.id !== "title" && waiting && film.clock - Math.max(film.waitStart, film.lastInput) > 75) go("title");
    // keep the frame rate: lower the render scale when frames run long
    ftAvg = ftAvg * .94 + dtms * .06;
    if (film.clock - lastAdjust > 2.5 && film.clock > 4) {
      if (ftAvg > 26 && scale > .5) { scale = Math.max(.5, scale * .84); layout(); lastAdjust = film.clock; ftAvg = 16; }
      else if (ftAvg < 13 && scale < BASE) { scale = Math.min(BASE, scale * 1.1); layout(); lastAdjust = film.clock; ftAvg = 16; }
    }
    requestAnimationFrame(frame);
  }

  // ---------- start ----------
  if (Q.has("debug")) window.__film = { get id() { return film.id; }, get t() { return film.t; }, get fps() { return Math.round(1000 / ftAvg); }, get scale() { return scale; } };
  const STRIP = Q.get("strip");   // "open@2,raid@20,..." renders many moments into one contact sheet (pictures only)
  if (STRIP) {
    YOUR = M.pickSortie(S, M.rng(+(Q.get("seed") || 3)), FATE);
    const shots = STRIP.split(","), cols = +(Q.get("cols") || 3), cw = Math.floor(FW / cols), ch = Math.round(cw * FH / FW);
    const sheet = document.createElement("canvas");
    sheet.width = cw * cols; sheet.height = ch * Math.ceil(shots.length / cols);
    Object.assign(sheet.style, { position: "fixed", left: 0, top: 0, zIndex: 9, background: "#000" });
    const g = sheet.getContext("2d");
    g.font = "14px Georgia"; g.textBaseline = "top";
    shots.forEach((spec, i) => {
      const [id, at] = spec.split("@");
      CHOICE = Q.has("choice") ? +Q.get("choice") : 1;
      go(id);
      if (id === "raid" && +at > 13.6) { film.t = 13.6; claim(); }
      if (id === "decide") { choiceAt = +at > 9 ? 6 : null; hover = 0; hoverK = 1; }
      film.t = +at;
      const L = H.layer(), P = H.post(), B = film.R.layers(film.t, L, P, 0) || outro(film.R, film.t, P);
      E.render(L, B, P, film.t);
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.drawImage(cv, x, y, cw, ch);
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x, y, g.measureText(spec).width + 10, 20);
      g.fillStyle = "#fff"; g.fillText(spec, x + 5, y + 3);
    });
    document.body.appendChild(sheet);
    document.title = "ok";
  } else if (STILL) {
    // one frame of one reel at one moment, for screenshots: ?still=reveal@20&fate=lost&choice=1&claim=12
    const [id, at] = STILL.split("@");
    YOUR = M.pickSortie(S, M.rng(+(Q.get("seed") || 3)), FATE);
    CHOICE = Q.has("choice") ? +Q.get("choice") : -1;
    go(id);
    if (id === "raid" && +at > +(Q.get("claim") || 13.6)) { film.t = +(Q.get("claim") || 13.6); claim(); }
    if (id === "decide" && CHOICE >= 0) { choiceAt = 6; hover = CHOICE; hoverK = 1; }
    if (id === "decide" && Q.has("hover")) { hover = +Q.get("hover"); hoverK = 1; }
    if (id === "wald" && Q.has("show")) showAt = +Q.get("show");
    film.t = +at || 0;
    for (const c of film.cues) if (c.t <= film.t) { c.done = true; if (/labels|rollCredits/.test(String(c.fn))) c.fn(); }
    const L = H.layer(), P = H.post();
    const B = film.R.layers(film.t, L, P, 0) || outro(film.R, film.t, P);
    lift(L, P);
    film.L = L;
    if (film.R.tick) film.R.tick(film.t, 0, L);
    for (const l of labs) l.el.style.transition = "none";
    E.render(L, B, P, film.t);
    drawWords(film.t, L.scene === 0 ? INK(L.medium) : "light"); drawSub(film.t); drawLabels(L, film.t);
    for (const c of cues) c.el.style.filter = "none";
    document.title = "ok";
  } else {
    go("title");
    requestAnimationFrame(frame);
  }
}
// paint the title first, then compile the shaders (a few seconds on some machines)
requestAnimationFrame(() => setTimeout(main, 0));
