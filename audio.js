// What We Don't See: the score and every sound effect, synthesized live with the WebAudio API.
// No audio files, no libraries. The director calls HOLES.audio.init() inside the Begin click, then mood() for the
// score, engines() / wind() / tension() / fire() for the continuous layers (call them every frame if you like;
// they are smoothed and deduplicated), and the one-shots, which rate-limit and voice-limit themselves.
// _build(ctx, destination) builds the whole graph on any BaseAudioContext, so audio-test.html can render
// every sound offline through an OfflineAudioContext and measure it.
(function () {
  const H = window.HOLES = window.HOLES || {};
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, +x || 0));

  // The score stays around D. A bed is an upper voicing (MIDI notes) held on detuned oscillator pairs through two
  // slowly breathing lowpass filters (left and right), over a root: a pad voice plus a sub sine an octave below
  // (for the two lowest roots, in unison with it: a sub under 49 Hz only costs headroom).
  // With two roots, they trade places every `period` seconds under the same upper notes, so D minor add9 becomes
  // B-flat major 7 #11 and back. The motif, A4 E5 D5 A5, sits inside every one of these chords.
  const MOODS = {
    title:    { root: [38, 34], period: 8, notes: [57, 62, 65, 76], wave: "sawtooth", cut: 800 },               // Dm add9 / B-flat maj7 #11
    dawn:     { root: [38, 43], period: 10, notes: [57, 66, 69, 76], wave: "triangle", cut: 2600, bloom: 6, level: .9 }, // D add9 / G maj13: sunrise
    raid:     { root: [26], notes: [45, 50, 53, 63], wave: "sawtooth", cut: 520, level: .8 },                    // D minor, flat 2: dread
    home:     { root: [31, 36], period: 9, notes: [50, 58, 65, 69], wave: "sawtooth", cut: 950 },                // G minor 9 / C 13 sus
    hangar:   { root: [33, 29], period: 12, notes: [52, 60, 64, 71], wave: "triangle", cut: 1500, level: .9 },   // A minor add9 / F maj7 #11
    decision: { root: [33], notes: [57, 64, 71, 74], wave: "triangle", cut: 1900, level: .75 },                  // A sus: a held breath
    wald:     { root: [33], notes: [52, 62, 67, 71], wave: "sawtooth", cut: 750 },                               // A9 sus4: the question
    reveal:   { root: [34], notes: [53, 62, 69, 76], wave: "sawtooth", cut: 3200, bloom: 3,                      // B-flat maj7 #11, opening
                wide: .9, rev: .45, shimmer: [81, 86, 88, 93] },                                                 //   up, with high glints
    echo:     { root: [38, 34], period: 10, notes: [57, 65, 72, 76], wave: "triangle", cut: 1100, level: .75 },  // D minor 9 / B-flat maj9 #11
    credits:  { root: [38, 43], period: 10, notes: [57, 64, 66, 69], wave: "sawtooth", cut: 1300, level: .9 },   // D add9 / G maj13: resolved
  };
  const MOTIF = [69, 76, 74, 81];
  // one-shots: [shortest gap between two calls (s), most voices of this kind at once, level]; 24 voices in all.
  // Balanced against beds around -22 LUFS: accents (motif, bell, clink, claim) peak 4-6 LU above them, impacts 8-12.
  const LIM = { flak: [.05, 8, .31], hit: [.03, 6, .34], fighter: [.3, 3, .25], boom: [.15, 3, .44], stamp: [.012, 12, .32],
    tick: [.025, 4, .55], clink: [.05, 4, .2], bell: [.1, 7, .24], whoosh: [.08, 3, .5], riser: [.25, 2, .45],
    heartbeat: [.25, 3, .55], claim: [.4, 2, .34], motif: [.04, 8, .35] };
  const MAX_VOICES = 24;
  // mix levels: pad oscillator, sub sine, shimmer partial, and the whole bed
  const PAD = .05, SUB = .05, SHIM = .03, BED = .56;

  function build(ctx, dest) {
    const sr = ctx.sampleRate, now = () => ctx.currentTime;

    // ---------- generated buffers ----------
    const makeBuf = (ch, sec, rate, fill) => {
      const b = ctx.createBuffer(ch, Math.ceil(sec * rate), rate);
      for (let c = 0; c < ch; c++) fill(b.getChannelData(c));
      return b;
    };
    const WHITE = makeBuf(2, 2, sr, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    const BROWN = makeBuf(1, 6, sr, d => {
      const n = d.length - 1;
      let y = 0, m = 0, mean = 0;
      for (let i = 0; i <= n; i++) d[i] = y = (y + .02 * (Math.random() * 2 - 1)) / 1.02;
      const drift = d[n] - d[0];
      for (let i = 0; i <= n; i++) mean += (d[i] -= drift * i / n) / (n + 1);   // loops without a click...
      for (let i = 0; i <= n; i++) m = Math.max(m, Math.abs(d[i] -= mean));    // ...and without DC (the ramp alone left one)
      for (let i = 0; i <= n; i++) d[i] /= m;
    });
    const CRACKLE = makeBuf(1, 3, sr, d => {
      for (let k = 0; k < 120; k++) {
        const at = Math.floor(Math.random() * d.length), len = Math.floor(rnd(.0003, .004) * sr);
        const a = Math.pow(Math.random(), 2.5) * (Math.random() < .5 ? -1 : 1);
        // each pop opens over a quarter of a millisecond: a crackle, not a one-sample digital step
        for (let j = 0; j < len && at + j < d.length; j++) d[at + j] += a * (Math.random() * 2 - 1) * Math.exp(-5 * j / len) * Math.min(1, j / 12);
      }
    });
    // Shepard-Risset control signals for the tension layer: a pitch ramp and a loudness window, 4 octaves per 48 s
    const SH_N = 4, SH_P = 48, CR = 8000;
    const RAMP = makeBuf(1, SH_P, CR, d => { for (let i = 0; i < d.length; i++) d[i] = i / d.length; });
    const WIN = makeBuf(1, SH_P, CR, d => { for (let i = 0; i < d.length; i++) d[i] = Math.pow(Math.sin(Math.PI * i / d.length), 2); });
    // a bed with two roots trades them every `period` seconds, for as long as it plays (the title idles for hours):
    // one looping envelope per root, the root-0 one already up at the start
    const XF = {};
    const xfade = (P, j) => XF[P + ":" + j] || (XF[P + ":" + j] = makeBuf(1, 2 * P, CR, d => {
      const a = 1 - Math.exp(-1 / (CR * .4));
      let y = 0;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < d.length; i++) { y += a * (+((i / CR + 1.2) % (2 * P) < P === !j) - y); if (pass) d[i] = y; }
    }));
    // reverb: 3.5 s of decaying stereo noise (-60 dB at the end) that darkens as it fades, after a 15 ms pre-delay
    const IR = makeBuf(2, 3.5, sr, d => {
      let y = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        y += (.08 + .55 * Math.exp(-t / .8)) * (Math.random() * 2 - 1 - y);
        d[i] = t < .015 ? 0 : y * Math.exp(-t * 6.9 / 3.5) * Math.min(1, (t - .015) / .01);
      }
    });
    const curve = (n, f) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = f(i / (n - 1) * 2 - 1); return c; };
    // the ceiling: unity up to -3.6 dBFS, then a smooth shoulder that never passes 0.83 (-1.6 dBFS, so the true peak,
    // between samples, stays under -1 dBTP); input range +-4
    const CEIL = curve(8193, u => { const x = Math.abs(u * 4), k = .66, c = .83; return Math.sign(u) * (x < k ? x : k + (c - k) * Math.tanh((x - k) / (c - k))); });
    const TANH = curve(1025, u => Math.tanh(2.5 * u) / Math.tanh(2.5));
    const QDB = q => 20 * Math.log10(q);            // a lowpass or highpass Q is in dB in WebAudio

    // ---------- master chain: bus -> 30 Hz highpass -> compressor -> ceiling -> master (mute) -> destination ----------
    // The highpass (4th-order Butterworth) takes out DC and the rumble below hearing, which laptop speakers can't play
    // but the compressor would still duck everything for. Chrome's compressor adds its own makeup gain (+4.8 dB here).
    const bus = ctx.createGain(), comp = ctx.createDynamicsCompressor(), pre = ctx.createGain(), ceil = ctx.createWaveShaper(), master = ctx.createGain();
    const hp = [.541, 1.307].map(q => { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 30; f.Q.value = QDB(q); return f; });
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = .003;
    comp.release.value = .001; comp.release.setValueAtTime(.25, now() + .05);   // Chrome's compressor starts closed; open it at once
    bus.gain.value = 1.3;                           // the drive into the compressor: beds +2.3 dB, peaks +0.8 dB
    pre.gain.value = .25; ceil.curve = CEIL;
    bus.connect(hp[0]).connect(hp[1]).connect(comp).connect(pre).connect(ceil).connect(master).connect(dest);
    // one shared reverb, fed by sends
    const revIn = ctx.createGain(), revHp = ctx.createBiquadFilter(), conv = ctx.createConvolver();
    revHp.type = "highpass"; revHp.frequency.value = 140; conv.buffer = IR;
    revIn.connect(revHp).connect(conv).connect(bus);

    // sine waves starting at eight phases: slow LFOs that all started at phase 0 would swell and sag together (every
    // bed rose for its first 10 s, then sank 4-6 dB); made once, since building a wave costs the main thread
    const PHASES = [...Array(8)].map((_, k) => ctx.createPeriodicWave(new Float32Array([0, Math.sin(k * Math.PI / 4)]), new Float32Array([0, Math.cos(k * Math.PI / 4)])));

    // ---------- node groups: every node made through a group is disconnected when its last source ends ----------
    function group(done) {
      const nodes = [], srcs = [];
      let live = 0;
      const G = {
        add(n) { nodes.push(n); return n; },
        gain(v = 1) { const n = G.add(ctx.createGain()); n.gain.value = v; return n; },
        filter(type, f, q = .7) { const n = G.add(ctx.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n; },
        pan(p = 0) { const n = G.add(ctx.createStereoPanner()); n.pan.value = p; return n; },
        shaper(c) { const n = G.add(ctx.createWaveShaper()); n.curve = c; return n; },
        src(n, t0, t1, off) {
          G.add(n); srcs.push(n); live++;
          n.onended = () => { if (--live) return; nodes.forEach(x => x.disconnect()); if (done) done(); };
          if (off === undefined) n.start(t0); else n.start(t0, off);
          if (t1 !== undefined) n.stop(t1);
          return n;
        },
        osc(type, f, t0, t1, det = 0) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; return G.src(o, t0, t1); },
        play(buf, t0, t1, off = Math.random() * buf.duration, rate = 1) {
          const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; return G.src(s, t0, t1, off);
        },
        wobble(f, t0, t1) { const o = ctx.createOscillator(); o.setPeriodicWave(PHASES[Math.random() * 8 | 0]); o.frequency.value = f; return G.src(o, t0, t1); },
        lfo(param, rate, depth, t0, t1) { const o = G.wobble(rate, t0, t1); o.connect(G.gain(depth)).connect(param); return o; },
        stop(t) { srcs.forEach(s => { try { s.stop(t); } catch (e) { /* already stopping */ } }); },
      };
      return G;
    }
    // percussive envelope: rise to peak in about `a` seconds, then decay with time constant `d`.
    // Built from setTargetAtTime only, so several strikes on one param simply chain.
    const strike = (p, t, peak, d, a = .002) => { p.setTargetAtTime(peak, t, a / 3); p.setTargetAtTime(0, t + a, d); };
    const sweep = (p, t, v0, v1, dur) => { p.setValueAtTime(v0, t); p.exponentialRampToValueAtTime(v1, t + dur); };

    // ---------- one-shot voices: rate limit, per-kind cap, global cap, and a fade before the sources stop ----------
    const lastT = {}, busy = {};
    let active = 0;
    function voice(kind, pan, rev, dur, level = 1) {
      const [gap, cap, lvl] = LIM[kind], t = now();
      if (active >= MAX_VOICES || (busy[kind] || 0) >= cap || t - (lastT[kind] ?? -1e9) < gap) return null;
      lastT[kind] = t; busy[kind] = (busy[kind] || 0) + 1; active++;
      const v = group(() => { busy[kind]--; active--; });
      v.t = t + .01;                                  // a hair ahead, so envelopes start clean
      v.end = v.t + dur;
      v.panner = v.pan(clamp(pan, -1, 1)); v.panner.connect(bus);
      v.out = v.gain(lvl * level); v.out.connect(v.panner);
      v.out.gain.setTargetAtTime(0, v.end - .06, .008);   // -65 dB by the time the sources stop
      if (rev) v.out.connect(v.gain(rev)).connect(revIn);
      return v;
    }
    // a tone with a percussive envelope, into `to`
    function tone(v, type, f, t, peak, d, a, to) {
      const o = v.osc(type, f, t, v.end), g = v.gain(0);
      strike(g.gain, t, peak, d, a); o.connect(g).connect(to || v.out);
      return o;
    }
    // a train of tiny clicks on a noise source: shrapnel, rivets, the airframe rattling
    function rattle(v, src, t, peak, count, span, f) {
      const bp = v.filter("bandpass", f, 1.4), g = v.gain(0);
      src.connect(bp).connect(g).connect(v.out);
      const ts = Array.from({ length: count }, () => t + span * Math.pow(Math.random(), 1.6)).sort((a, b) => a - b);
      ts.forEach((tk, k) => strike(g.gain, tk, peak * rnd(.35, 1) * (1 - .6 * k / count), .006, .0006));
    }

    // ---------- continuous layers (made on first use, then kept) ----------
    const layers = {};
    function fade(L, v, tc) {
      if (Math.abs(v - L.v) < .002) return;
      const t = now();
      L.v = v; L.out.gain.setTargetAtTime(v * L.k, t, tc);
      if (L.set) L.set(v, t, tc);
    }
    function layer(name, v, make) {
      v = clamp(v, 0, 1);
      const L = layers[name] || (v > 0 ? (layers[name] = make()) : null);
      if (L) fade(L, v, .35);
      return L;
    }
    function newLayer(k) {
      const G = group(), out = G.gain(0);
      out.connect(bus);
      return { G, out, k, v: 0, t: now() };
    }

    // four radial engines: two pairs of detuned sawtooth drones at the propellers' blade rate (about 64 Hz, so they
    // beat), plus brown-noise rumble, each pair throbbing with its propellers (20.3 and 21.4 Hz, so the pairs beat too).
    // The 64 Hz fundamental is only support (a laptop can't play it); the growl is in the harmonics, 128-600 Hz.
    function makeEngines() {
      const L = newLayer(.19), { G, t } = L, lps = [];
      L.pan = G.pan(0); L.p = 0;
      L.out.disconnect(); L.out.connect(L.pan).connect(bus);
      const drift = G.wobble(.05, t);                 // engine speeds wander, so the beating never settles
      [[1, 1.0035, -.35, 20.3], [.9968, 1.0071, .35, 21.4]].forEach(([r1, r2, p, am]) => {
        const amp = G.gain(.65), lp = G.filter("lowpass", 420, .9), rum = G.filter("lowpass", 120, .9);
        for (const r of [r1, r2]) {
          const o = G.osc("sawtooth", 64 * r, t);
          drift.connect(G.gain(rnd(-10, 10))).connect(o.detune);
          o.connect(G.gain(.6)).connect(lp);
        }
        G.play(BROWN, t).connect(rum).connect(G.gain(.5)).connect(amp);
        lp.connect(G.filter("highpass", 90, QDB(.707))).connect(amp);   // the fundamental down 7 dB, the harmonics kept
        G.lfo(amp.gain, am, .3, t);
        amp.connect(G.pan(p)).connect(L.out);
        lps.push(lp);
      });
      L.set = (v, t, tc) => lps.forEach(f => f.frequency.setTargetAtTime(200 + 440 * v, t, tc));   // distance muffles
      return L;
    }
    // high-altitude wind: gusting band of stereo noise, a faint whistle, and low buffeting
    function makeWind() {
      const L = newLayer(.22), { G, t } = L;
      const n = G.play(WHITE, t), bp = G.filter("bandpass", 650, .6), lp = G.filter("lowpass", 2500, .5), gust = G.gain(.7);
      n.connect(bp).connect(lp).connect(gust).connect(L.out);
      G.lfo(bp.frequency, .11, 280, t); G.lfo(bp.frequency, .043, 200, t); G.lfo(gust.gain, .07, .3, t);
      const wh = G.filter("bandpass", 1500, 14);
      n.connect(wh).connect(G.gain(1.2)).connect(L.out);
      G.lfo(wh.frequency, .09, 260, t);
      G.play(BROWN, t).connect(G.filter("lowpass", 280, .7)).connect(G.gain(.5)).connect(gust);
      L.set = (v, t, tc) => lp.frequency.setTargetAtTime(1200 + 2800 * v, t, tc);
      return L;
    }
    // tension: a Shepard-Risset glissando of bowed minor seconds (D against E-flat) that rises forever
    function makeTension() {
      const L = newLayer(.13), { G, t } = L;
      const lp = G.filter("lowpass", 1200, .5), trem = G.gain(.8), l = G.pan(-.45), r = G.pan(.45);
      l.connect(lp); r.connect(lp); lp.connect(trem).connect(L.out);
      L.out.connect(G.gain(.3)).connect(revIn);
      G.lfo(trem.gain, 6.3, .2, t);                    // bowed tremolo
      for (let k = 0; k < SH_N; k++) {
        const off = k * SH_P / SH_N, rg = G.gain(1200 * SH_N);
        G.play(RAMP, t, undefined, off).connect(rg);
        const win = G.play(WIN, t, undefined, off);
        [[38, -4, l, 1], [39, 5, r, .6]].forEach(([m, det, side, a]) => {
          const o = G.osc("sawtooth", mtof(m), t, undefined, det), g = G.gain(0);
          rg.connect(o.detune); win.connect(g.gain);
          o.connect(G.gain(a)).connect(g).connect(side);
        });
      }
      L.set = (v, t, tc) => lp.frequency.setTargetAtTime(700 + 2600 * v, t, tc);
      return L;
    }
    // engine fire: a fluttering roar in the slipstream, a hiss, and crackle
    function makeFire() {
      const L = newLayer(.2), { G, t } = L;
      const lp = G.filter("lowpass", 600, .7), roar = G.gain(1);
      G.play(BROWN, t).connect(lp).connect(roar).connect(L.out);
      [[4.3, .25], [7.1, .18], [11.3, .12]].forEach(([f, d]) => G.lfo(roar.gain, f, d, t));
      G.play(WHITE, t).connect(G.filter("bandpass", 1600, .6)).connect(G.gain(.08)).connect(L.out);
      const hp = G.filter("highpass", 1000, .7), crk = G.gain(0);
      G.play(CRACKLE, t).connect(hp); G.play(CRACKLE, t, undefined, undefined, .77).connect(hp);
      hp.connect(G.filter("lowpass", 6500, QDB(.707))).connect(crk).connect(L.out);   // wood, not digital ticks
      L.set = (v, t, tc) => { lp.frequency.setTargetAtTime(250 + 900 * v, t, tc); crk.gain.setTargetAtTime(1.2 * v, t, tc); };
      return L;
    }

    // ---------- score beds ----------
    let bed = null, moodName = null, beds = 0;
    const fading = [];
    function makeBed(m, t) {
      beds++;
      const G = group(() => beds--), out = G.gain(0), w = m.wide || .6;
      out.connect(bus); out.connect(G.gain(m.rev || .25)).connect(revIn);
      const sides = [-w, w].map((p, s) => {
        const lp = G.filter("lowpass", m.cut, .6);
        lp.connect(G.pan(p)).connect(out);
        if (m.bloom) { lp.frequency.setValueAtTime(m.cut * .3, t); lp.frequency.setTargetAtTime(m.cut, t, m.bloom); }
        G.lfo(lp.frequency, s ? .061 : .043, m.cut * .2, t);
        return lp;
      });
      // one note: a detuned pair, left and right, breathing on its own slow cycle, into `to` (default: the filters)
      const pair = (n, to = sides) => {
        const bd = G.gain(PAD * .45);
        G.wobble(rnd(.025, .08), t).connect(bd);
        sides.forEach((lp, s) => {
          const g = G.gain(PAD);
          bd.connect(g.gain);
          G.osc(m.wave, mtof(n), t, undefined, s ? 6 : -6).connect(g).connect(to[s]);
        });
      };
      m.notes.forEach(n => pair(n));
      m.root.forEach((r, j) => {                       // root voice + sub; two roots trade places every period
        const xs = [0, 1, 2].map(() => G.gain(m.root.length > 1 ? 0 : 1));
        xs[0].connect(sides[0]); xs[1].connect(sides[1]); xs[2].connect(out);
        if (m.root.length > 1) { const x = G.play(xfade(m.period, j), t, undefined, 0); xs.forEach(g => x.connect(g.gain)); }
        pair(r + 12, xs);
        G.osc("sine", mtof(r < 31 ? r + 12 : r), t).connect(G.gain(SUB)).connect(xs[2]);   // support, never below G1 (49 Hz)
      });
      if (m.shimmer) {                                 // high partials that fade in and glint
        const sh = G.gain(0);
        sh.gain.setValueAtTime(0, t + 1); sh.gain.setTargetAtTime(1, t + 1, 3);
        sh.connect(out); sh.connect(G.gain(.6)).connect(revIn);
        m.shimmer.forEach((n, k) => {
          const g = G.gain(SHIM * .5);
          G.lfo(g.gain, rnd(.12, .3), SHIM * .5, t);
          G.osc("sine", mtof(n), t, undefined, rnd(-3, 3)).connect(g).connect(G.pan(k % 2 ? .7 : -.7)).connect(sh);
        });
      }
      G.out = out;
      return G;
    }

    const S = {
      ctx, master, bus,
      _active: () => active,
      _beds: () => beds,

      mood(name, s = 3) {
        const m = MOODS[name];
        if ((m && name === moodName) || (!m && name !== "silence")) return;
        moodName = name;
        const t = now(), tc = Math.max(+s || 0, .05) / 3;
        if (bed) { bed.out.gain.setTargetAtTime(0, t, tc); bed.stop(t + tc * 8 + .1); fading.push(bed); }
        while (fading.length > 2) { const b = fading.shift(); b.out.gain.setTargetAtTime(0, t, .015); b.stop(t + .1); }   // called fast: three beds at most
        bed = null;
        if (!m) { for (const k in layers) fade(layers[k], 0, tc); return; }
        bed = makeBed(m, t);
        bed.out.gain.setTargetAtTime(BED * (m.level || 1), t, tc);
      },

      engines(v, pan = 0) {
        const L = layer("engines", v, makeEngines);
        pan = clamp(pan, -1, 1);
        if (L && Math.abs(pan - L.p) > .002) { L.p = pan; L.pan.pan.setTargetAtTime(pan, now(), .3); }
      },
      wind(v) { layer("wind", v, makeWind); },
      tension(v) { layer("tension", v, makeTension); },
      fire(v) { layer("fire", v, makeFire); },

      // a shell bursting: a thump, a noise blast that darkens as it rolls away, and when close a crack and shrapnel
      flak(pan = 0, near = .5) {
        near = clamp(near, 0, 1);
        const v = voice("flak", pan, .45 - .3 * near, 2.2 + (1 - near)); if (!v) return;
        const t = v.t, L = .3 + .7 * near;
        sweep(tone(v, "sine", 90, t, .5 * L, .16 + .14 * (1 - near), .004).frequency, t, 90 + 40 * near, 45, .4);
        const n = v.play(WHITE, t, v.end), lp = v.filter("lowpass", 400, .5), ng = v.gain(0);
        sweep(lp.frequency, t, 600 + 3000 * near * near, 110, 1.3);
        strike(ng.gain, t, .75 * L, .12 + .38 * (1 - near), .006);
        n.connect(lp).connect(ng).connect(v.out);
        if (near > .25) {
          const cg = v.gain(0);
          strike(cg.gain, t, .8 * near * near, .012, .001);
          n.connect(v.filter("highpass", 1600)).connect(cg).connect(v.out);
          if (near > .5) rattle(v, n, t + .05, .6 * (near - .4), 4 + Math.round(8 * near), .4, 4500);
        }
      },

      // a bullet through the skin: a low knock, a bright snap, the skin ringing, then the airframe rattling
      hit(pan = 0) {
        const v = voice("hit", pan, .18, .9); if (!v) return;
        const t = v.t, n = v.play(WHITE, t, v.end);
        sweep(tone(v, "sine", 170, t + .002, .75, .045, .002).frequency, t + .002, rnd(150, 190), 55, .07);
        const sg = v.gain(0);
        strike(sg.gain, t, .7, .018, .0015);
        n.connect(v.filter("bandpass", rnd(2200, 3200), .9)).connect(sg).connect(v.out);
        const f0 = rnd(520, 700);
        for (const [r, a, d] of [[1, .22, .09], [2.37, .16, .06], [3.91, .12, .045], [6.1, .08, .03]]) tone(v, "sine", f0 * r * rnd(.97, 1.03), t + .001, a, d, .001);
        rattle(v, n, t + .03, .35, 7, .22, rnd(3000, 5000));
      },

      // a fighter screaming past: a physically shaped fly-by (doppler, 1/r loudness, air absorption), guns as it closes
      fighter(pan = 0) {
        const D = 2.8, tp = 1.15, N = 96, P = clamp(pan, -1, 1), dir = P < 0 ? -1 : 1;
        const v = voice("fighter", 0, .3, D + .05); if (!v) return;
        const t = v.t, n = v.play(WHITE, t, v.end);   // a source first: if a curve below throws, the voice still ends and frees its slot
        const amp = new Float32Array(N), ratio = new Float32Array(N), cut = new Float32Array(N), pn = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          const s = i / (N - 1) * D, x = 5.5 * (s - tp), r = Math.sqrt(1 + x * x), rad = x / r;
          amp[i] = Math.min(1, s / .25, (D - s) / .3) * Math.pow(r, -1.3);
          ratio[i] = 1 / (1 + .17 * rad);
          cut[i] = 500 + 5200 / (r * r);
          pn[i] = clamp(P + .45 * rad * dir, -1, 1);   // it dives down the screen, so it drifts, it doesn't cross
        }
        v.panner.pan.setValueCurveAtTime(pn, t, D);
        const eng = v.gain(0), lp = v.filter("lowpass", 800, 1.2), rough = v.gain(.7);
        eng.gain.setValueCurveAtTime(amp, t, D);
        lp.frequency.setValueCurveAtTime(cut, t, D);
        const f0 = rnd(105, 125);
        for (const [k, type, a] of [[1, "sawtooth", .5], [1.506, "sawtooth", .3], [.5, "square", .15], [19, "triangle", .05]]) {
          const o = v.osc(type, f0 * k, t, v.end);
          o.frequency.setValueCurveAtTime(ratio.map(q => q * f0 * k), t, D);
          o.connect(v.gain(a)).connect(lp);
        }
        v.lfo(rough.gain, 31, .3, t, v.end);          // engine roughness
        lp.connect(rough).connect(eng).connect(v.out);
        const bp = v.filter("bandpass", 1000, .8);
        bp.frequency.setValueCurveAtTime(cut.map(c => c * .6 + 300), t, D);
        n.connect(bp).connect(v.gain(.5)).connect(eng);
        // guns: a burst of eight rounds, about 15 a second
        const gg = v.gain(0), th = v.gain(0);
        n.connect(v.filter("bandpass", 900, .8)).connect(gg).connect(v.out);
        v.osc("sine", 70, t, v.end).connect(th).connect(v.out);
        for (let k = 0, tk = t + tp - .75; k < 8; k++, tk += rnd(.06, .074)) {
          strike(gg.gain, tk, .5 * rnd(.7, 1), .02, .001);
          strike(th.gain, tk, .3, .03, .002);
        }
      },

      // a deep cinematic impact: a saturated sub drop (its harmonics carry it on small speakers), a mid thud,
      // a noise blast closing down, and a crack on top. k (0..1.25) rides its level, so the biggest hit can stay the biggest.
      boom(k = 1) {
        const v = voice("boom", 0, .35, 5, clamp(k, 0, 1.25)); if (!v) return;
        const t = v.t, o = v.osc("sine", 100, t, v.end), og = v.gain(0);
        sweep(o.frequency, t, 100, 30, 1.6);
        strike(og.gain, t, 1, .7, .005);
        o.connect(og).connect(v.shaper(TANH)).connect(v.gain(.65)).connect(v.out);
        sweep(tone(v, "triangle", 190, t, .5, .3, .004).frequency, t, 190, 52, .8);
        const n = v.play(WHITE, t, v.end), lp = v.filter("lowpass", 3500, .6), ng = v.gain(0);
        sweep(lp.frequency, t, 3500, 90, 2.2);
        strike(ng.gain, t, .6, .55, .004);
        n.connect(lp).connect(ng).connect(v.out);
        const cg = v.gain(0);
        strike(cg.gain, t, .45, .015, .001);
        n.connect(v.filter("bandpass", 1500, 1)).connect(cg).connect(v.out);
      },

      // a bullet hole stamped onto the drawing: a small tuned tock. i walks up A minor pentatonic (A4 C5 D5 E5 G5),
      // so a fast run becomes a ripple; the faster the run, the softer each stamp, like a roll, but a run still swells
      // as it speeds up (about +7 dB from 3 to 60 a second). k (0..1), how far a run has got, swells it further
      // (+8 dB from 0 to 1): a director calling once a frame runs at 60 a second from the start. At most 83 a second.
      stamp(i = 0, k = 1) {
        i = Math.abs(Math.floor(+i || 0));
        const gap = now() - (lastT.stamp ?? -1e9);
        const v = voice("stamp", rnd(-.35, .35), .12, .25, Math.pow(clamp(gap / .15, .08, 1), .3) * (.4 + .6 * clamp(k, 0, 1))); if (!v) return;
        const t = v.t, f = 440 * Math.pow(2, [0, 3, 5, 7, 10][i % 5] / 12);
        sweep(tone(v, "sine", f, t, .35, .045, .001).frequency, t, f * 1.5, f, .01);
        tone(v, "sine", f * 2.76, t, .12, .015, .001);
        sweep(tone(v, "sine", 170, t, .3, .025, .002).frequency, t, 170, 90, .04);
        const ng = v.gain(0);
        strike(ng.gain, t, .15, .004, .0005);
        v.play(WHITE, t, v.end).connect(v.filter("highpass", 3500)).connect(ng).connect(v.out);
      },

      // a film splice / shutter: two clicks 26 ms apart and a small knock
      tick() {
        const v = voice("tick", rnd(-.1, .1), .08, .2); if (!v) return;
        const t = v.t, g = v.gain(0);
        strike(g.gain, t, .9, .004, .0005); strike(g.gain, t + .026, .55, .005, .0005);
        v.play(WHITE, t, v.end).connect(v.filter("bandpass", 3200, 1.1)).connect(g).connect(v.out);
        sweep(tone(v, "sine", 240, t, .3, .012, .001).frequency, t, 240, 140, .03);
      },

      // armour landing: it strikes, bounces, settles, and rings like something precious (tuned to E6, with a halo on E5 and A5)
      clink() {
        const v = voice("clink", rnd(-.15, .15), .4, 8.5); if (!v) return;
        const t = v.t, f0 = mtof(88) * rnd(.995, 1.005);
        const modes = [[1, .3, 1.2], [2.01, .12, .9], [2.76, .16, .6], [4.07, .09, .4], [5.43, .06, .28], [7.2, .04, .2]];
        [[0, 1], [.085, .45], [.14, .2]].forEach(([dt, k], c) => {
          const tc = t + dt;
          for (const [r, a, d] of modes.slice(0, c ? 4 : 6)) tone(v, "sine", f0 * r * (c ? rnd(.99, 1.01) : 1), tc, a * k, c ? d * .4 : d, .001);
          tone(v, "sine", 150, tc, .4 * k, .05, .002);
          const ng = v.gain(0);
          strike(ng.gain, tc, .2 * k, .006, .0005);
          v.play(WHITE, tc, v.end).connect(v.filter("highpass", 5000)).connect(ng).connect(v.out);
        });
        for (const m of [76, 81]) tone(v, "sine", mtof(m), t, .05, 1.2, .05);
      },

      // a warm church-bell spectrum (hum, prime, minor-third tierce, quint, nominal...), the low partials in beating pairs;
      // k (0..1) rides its level, for bells that ring over each other
      bell(pitch = 0, k = 1) {
        const v = voice("bell", rnd(-.1, .1), .45, 10, clamp(k, 0, 1)); if (!v) return;   // its longest partial is 30 dB down by then
        const t = v.t, f = mtof(50 + (+pitch || 0));
        for (const [r, a, d] of [[.5, .2, 2.8], [1, .3, 2.2], [1.19, .16, 1.7], [1.5, .1, 1.3], [2, .24, 1.8], [2.51, .08, .9], [2.66, .06, .8], [3.01, .05, .6], [4.17, .04, .4]]) {
          const g = v.gain(0);
          strike(g.gain, t, r <= 2 ? a * .6 : a, d, .004);
          g.connect(v.out);
          v.osc("sine", f * r, t, v.end).connect(g);
          if (r <= 2) v.osc("sine", f * r + rnd(.4, 1.3), t, v.end).connect(g);
        }
        const cg = v.gain(0);
        strike(cg.gain, t, .15, .02, .001);
        v.play(WHITE, t, v.end).connect(v.filter("bandpass", 2000, .8)).connect(cg).connect(v.out);
      },

      // a transition swish: a noise band sweeping up and across, left to right
      whoosh() {
        const D = .9, v = voice("whoosh", 0, .25, D + .6); if (!v) return;
        const t = v.t, n = v.play(WHITE, t, v.end), bp = v.filter("bandpass", 350, 1.1), g = v.gain(0);
        bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(2600, t + D * .55); bp.frequency.exponentialRampToValueAtTime(700, t + D);
        g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.8, t + D * .55); g.gain.setTargetAtTime(0, t + D * .55, .1);
        v.panner.pan.setValueAtTime(-.7, t); v.panner.pan.linearRampToValueAtTime(.7, t + D);
        n.connect(bp).connect(g); n.connect(v.filter("lowpass", 500, .7)).connect(v.gain(.5)).connect(g);
        g.connect(v.out);
      },

      // a swell that rises for `sec` seconds and cuts off exactly then, into whatever hits next:
      // noise sweeping up, a string cluster sliding up an octave with accelerating tremolo, a sub swelling under it
      riser(sec = 3) {
        const T = clamp(sec || 3, .4, 30), v = voice("riser", 0, .3, T + .25); if (!v) return;
        const t = v.t, env = v.gain(0);
        env.gain.setValueAtTime(.003, t); env.gain.exponentialRampToValueAtTime(1, t + T); env.gain.setTargetAtTime(0, t + T, .025);
        env.connect(v.out);
        const bp = v.filter("bandpass", 250, .9);
        sweep(bp.frequency, t, 250, 7000, T);
        v.play(WHITE, t, v.end).connect(bp).connect(v.gain(.55)).connect(env);
        const lp = v.filter("lowpass", 400, .8), trem = v.gain(.6), lf = v.lfo(trem.gain, 5, .4, t, v.end);
        sweep(lp.frequency, t, 400, 6000, T);
        sweep(lf.frequency, t, 5, 17, T);
        for (const m of [50, 57, 62, 63]) {
          const d = rnd(-6, 6), o = v.osc("sawtooth", mtof(m), t, v.end, d);
          o.detune.setValueAtTime(d, t); o.detune.linearRampToValueAtTime(d + 1200, t + T);
          o.connect(v.gain(.18)).connect(lp);
        }
        lp.connect(trem).connect(env);
        const s = v.osc("sine", 40, t, v.end);
        sweep(s.frequency, t, 40, 75, T);
        s.connect(v.gain(.25)).connect(env);
      },

      // lub-dub: two low thumps, each with a body an octave up and a soft knock, so small speakers carry it
      heartbeat() {
        const v = voice("heartbeat", 0, .1, 1); if (!v) return;
        const t = v.t, lp = v.filter("lowpass", 900, .7), n = v.play(WHITE, t, v.end), ng = v.gain(0);
        lp.connect(v.out);
        n.connect(v.filter("lowpass", 1200, .7)).connect(ng).connect(v.out);
        for (const [dt, k] of [[0, 1], [.27, .72]]) {
          sweep(tone(v, "sine", 75, t + dt, .45 * k, .075, .006).frequency, t + dt, 75, 40, .12);
          sweep(tone(v, "square", 170, t + dt, .6 * k, .05, .006, lp).frequency, t + dt, 170, 105, .1);
          strike(ng.gain, t + dt, .35 * k, .015, .003);
        }
      },

      // the viewer claims their plane: a rising glitter of A, D and E over a warm swell
      claim() {
        const v = voice("claim", 0, .55, 4.5); if (!v) return;
        const t = v.t;
        [69, 74, 76, 81, 86, 88, 93, 98, 100].forEach((m, k) => {
          const tk = t + k * .075 + rnd(0, .03), f = mtof(m), g = v.gain(0);
          strike(g.gain, tk, .16, rnd(.35, .7), .003);
          g.connect(v.pan(rnd(-.7, .7))).connect(v.out);
          v.osc("sine", f, tk, v.end).connect(g);
          v.osc("sine", f * 2, tk, v.end).connect(v.gain(.25)).connect(g);
        });
        const lp = v.filter("lowpass", 2500, .7), sw = v.gain(0);
        sw.gain.setTargetAtTime(.08, t, .18); sw.gain.setTargetAtTime(0, t + .6, .9);
        lp.connect(sw).connect(v.out);
        for (const m of [62, 69, 74, 76]) v.osc("triangle", mtof(m), t, v.end).connect(lp);
        const ag = v.gain(0);
        ag.gain.setTargetAtTime(.05, t, .15); ag.gain.setTargetAtTime(0, t + .45, .5);
        v.play(WHITE, t, v.end).connect(v.filter("highpass", 7000)).connect(ag).connect(v.out);
      },

      // one note of the motif (A4 E5 D5 A5): a celesta-like FM ping that settles into a pure tone, with reverb
      motif(i = 0) {
        const k = ((Math.floor(+i || 0) % 4) + 4) % 4;
        const v = voice("motif", [-.2, .15, -.05, .25][k], .5, 6); if (!v) return;
        const t = v.t, f = mtof(MOTIF[k]);
        const c = tone(v, "sine", f, t, .4, 1.2, .003), mg = v.gain(0);
        strike(mg.gain, t, f * 4 * .9, .12, .002);
        v.osc("sine", f * 4, t, v.end).connect(mg).connect(c.frequency);
        tone(v, "sine", f * 2, t, .08, .5, .003);
        tone(v, "triangle", f / 2, t, .06, .9, .01);
      },
    };
    return S;
  }

  let S = null, started = null;
  const A = H.audio = {
    ready: false, muted: false, ctx: null, _build: build,
    // Call from a user gesture. Builds synchronously (so calls right after it are heard), then resolves once running
    // (or after 1 s if the browser is still holding it, in which case the next click or key starts it).
    init() {
      if (started) return started;
      try {
        const ctx = A.ctx = new (window.AudioContext || window.webkitAudioContext)();
        S = build(ctx, ctx.destination);
        S.master.gain.value = A.muted ? 0 : 1;
        A.ready = true;
        const wake = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); };   // held, or interrupted: the next click or key
        for (const e of ["pointerdown", "keydown", "touchend"]) addEventListener(e, wake, true);
        started = Promise.race([ctx.resume().catch(() => {}), new Promise(r => setTimeout(r, 1000))]).then(() => A);
      } catch (e) {
        started = Promise.reject(e);
      }
      return started;
    },
    setMute(m) {
      A.muted = !!m;
      if (S) S.master.gain.setTargetAtTime(A.muted ? 0 : 1, S.ctx.currentTime, .06);
    },
  };
  for (const k of ["mood", "engines", "wind", "tension", "fire", "flak", "hit", "fighter", "boom", "stamp", "tick", "clink", "bell", "whoosh", "riser", "heartbeat", "claim", "motif"])
    A[k] = (...a) => { if (S) S[k](...a); };
})();
