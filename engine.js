// WebGL2 engine. Per frame and per layer (A, and B during transitions):
//   1. hole field: every visible bullet hole as a point sprite -> crisp texture (nearest hole wins, via depth)
//   2. glow: the same holes as soft splats, additively -> density texture (r came home, g lost, b fresh, a the viewer's)
//   3. scene: one full-screen fragment shader (scene 0 subject + registered scenes) -> layer texture (mipmapped)
// then the post pass mixes the layers (a transition), and adds bloom, grain, vignette, weave, flash and fade.
(function () {
  const H = window.HOLES = window.HOLES || {};
  H.glsl = H.glsl || {}; H.scenes = H.scenes || {}; H.mediaDefs = H.mediaDefs || [];

  const VS_QUAD = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

  const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform vec2 uRes; uniform float uTime; uniform vec4 uCam; uniform int uScene;
uniform int uMedium; uniform float uShape; uniform vec3 uArc; uniform vec4 uPlane; uniform float uSplit;
uniform vec4 uFX; uniform vec4 uFX2; uniform vec4 uP[8];
uniform sampler2D uHole; uniform sampler2D uGlow; uniform sampler2D uData;
out vec4 fragColor;
vec4 row(int r, int i) { return texelFetch(uData, ivec2(i, r), 0); }
`;

  // points for the hole passes
  const VS_HOLES = `#version 300 es
precision highp float; precision highp sampler2D;
layout(location = 0) in vec4 aHole;   // x, y (plane space), seed, lost (0/1)
layout(location = 1) in vec4 aMeta;   // order within its kind, sortie, ghost index (-1 none), zone
uniform vec2 uRes; uniform vec4 uCam; uniform vec4 uPlane; uniform float uSplit;
uniform float uShowRet, uShowLost, uYour, uHoleR, uR, uFresh, uFall, uTime, uGlowPass;
uniform sampler2D uData; uniform int uGhostRow;
out vec4 vInfo;   // seed, kind code / 4, freshness, gold
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
void main() {
  bool lost = aHole.w > .5;
  float o = aMeta.x, shown = lost ? uShowLost : uShowRet;
  vec2 lp = aHole.xy + (uSplit > .001 ? vec2(lost ? uSplit : -uSplit, 0.) : vec2(0.));
  vec2 w = uPlane.xy + rot(uPlane.w) * lp * uPlane.z;
  float vis = step(o, shown - 1.);
  float fresh = uFresh * (lost ? 0. : exp(-max(shown - 1. - o, 0.) / 18.));
  if (lost && uFall >= 0.) {
    // lost holes fall from their ghost plane (data row uGhostRow: x, y, heading, scale) onto the drawing
    float delay = aMeta.z * .16 + fract(aHole.z * 7.3) * .45, k = clamp((uFall - delay) / 1.5, 0., 1.);
    vec4 g = texelFetch(uData, ivec2(int(aMeta.z), uGhostRow), 0);
    vec2 from = g.xy + rot(g.z) * aHole.xy * g.w;
    w = mix(from, w, k * k * (3. - 2. * k));
    vis = step(.001, k);
    fresh = k < 1. ? .6 + .4 * k : exp(-(uFall - delay - 1.5) * 2.5);
    if (uGlowPass < .5 && k < 1.) vis = 0.;   // the crisp field only takes a hole once it has landed
  }
  vec2 q = rot(-uCam.w) * (w - uCam.xy) / uCam.z;
  gl_Position = vis < .5 ? vec4(2., 2., 2., 1.) : vec4(q.x * 2. * uRes.y / uRes.x, q.y * 2., 0., 1.);
  gl_PointSize = 2. * uHoleR * uR * uPlane.z * uRes.y / uCam.z;
  float mine = abs(aMeta.y - uYour) < .5 ? 2. : 0.;
  vInfo = vec4(aHole.z, ((lost ? 2. : 1.) + mine) / 4., fresh, mine * .5);
}`;
  const FS_CRISP = `#version 300 es
precision highp float;
in vec4 vInfo; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2. - 1.; c.y = -c.y;
  float r = length(c); if (r > 1.) discard;
  o = vec4(c * .5 + .5, vInfo.x, vInfo.y); gl_FragDepth = r;
}`;
  const FS_GLOW = `#version 300 es
precision highp float;
in vec4 vInfo; out vec4 o;
uniform float uGain;
void main() {
  vec2 c = gl_PointCoord * 2. - 1.; float r2 = dot(c, c); if (r2 > 1.) discard;
  float g = exp(-r2 * 4.) * uGain;
  float isLost = (vInfo.y > .45 && vInfo.y < .55) || vInfo.y > .95 ? 1. : 0.;
  o = vec4(g * (1. - isLost), g * isLost, vInfo.z * exp(-r2 * 30.), vInfo.w * exp(-r2 * 10.));
}`;

  const FS_POST = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uA; uniform sampler2D uB; uniform vec2 uRes; uniform float uTime;
uniform float uMix; uniform int uTrans; uniform vec2 uCenter;
uniform vec4 uBlur;    // direction x, y, amount (uv), zoom blur
uniform vec4 uLook;    // exposure, bloom, grain, vignette
uniform vec4 uLook2;   // aberration, defocus (mip level), gate weave, halation
uniform vec4 uFade;    // flash to white, fade to black, (unused), invert
uniform vec3 uTint;
out vec4 fragColor;
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= .5; } return s; }
vec3 tap(sampler2D t, vec2 uv) { return textureLod(t, uv, uLook2.y).rgb; }
vec3 layer(sampler2D t, vec2 uv) {
  vec3 c;
  if (uBlur.z > 0. || uBlur.w > 0.) {
    c = vec3(0.);
    for (int i = 0; i < 14; i++) {
      float k = float(i) / 13. - .5;
      c += tap(t, uv + uBlur.xy * uBlur.z * k + (uv - uCenter) * uBlur.w * k);
    }
    c /= 14.;
  } else c = tap(t, uv);
  if (uLook2.x > 0.) { vec2 d = (uv - .5) * uLook2.x; c.r = tap(t, uv + d).r; c.b = tap(t, uv - d).b; }
  return c;
}
vec3 bloom(sampler2D t, vec2 uv) { return textureLod(t, uv, 2.5).rgb * .45 + textureLod(t, uv, 4.).rgb * .35 + textureLod(t, uv, 5.5).rgb * .2; }
float mask(vec2 uv) {
  vec2 a = vec2(uRes.x / uRes.y, 1.);
  if (uTrans == 1) { float n = fbm(uv * a * 3.2 + 7.); return smoothstep(n - .06, n + .06, uMix * 1.25 - .12); }       // ink bleed
  if (uTrans == 2) return smoothstep(uMix * 1.4, uMix * 1.4 - .015, length((uv - uCenter) * a));                         // iris open
  if (uTrans == 3) return smoothstep(uv.x - .06, uv.x, uMix * 1.12 - .06);                                               // wipe
  if (uTrans == 4) return step(.5, uMix);                                                                                // cut (with blur)
  if (uTrans == 5) { float n = fbm(uv * a * 2.2 + 3.); return smoothstep(n - .02, n + .02, uMix * 1.3 - .15); }         // burn
  return uMix;                                                                                                           // dissolve
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float fr = floor(uTime * 24.);
  uv += uLook2.z * (vec2(hash21(vec2(fr, 1.)), hash21(vec2(fr, 7.))) - .5) * vec2(.0012, .0018);
  vec3 col = layer(uA, uv), bl = bloom(uA, uv);
  if (uMix > 0.) {
    float m = mask(uv);
    col = mix(col, layer(uB, uv), m); bl = mix(bl, bloom(uB, uv), m);
    if (uTrans == 5) { float n = fbm(uv * vec2(uRes.x / uRes.y, 1.) * 2.2 + 3.), e = uMix * 1.3 - .15 - n;
      col += vec3(1., .45, .12) * exp(-abs(e) * 60.) * 1.4 * (1. - step(1., uMix)); }
  }
  col += max(bl - .45, 0.) * uLook.y + max(bl - .6, 0.) * vec3(1., .3, .1) * uLook2.w;
  col *= uLook.x * uTint;
  vec2 v = (uv - .5) * vec2(uRes.x / uRes.y * .62, 1.);
  col *= mix(1., smoothstep(1.05, .25, length(v)), uLook.w);
  col = mix(col, 1. - col, uFade.w);
  float g = hash21(gl_FragCoord.xy + fract(uTime * 7.31) * 413.) + hash21(gl_FragCoord.xy * 1.37 + fract(uTime * 3.7) * 97.) - 1.;
  col += g * uLook.z * (1. - .6 * dot(col, vec3(.3, .59, .11)));
  col = mix(col, vec3(1., .97, .92), uFade.x);
  col *= 1. - uFade.y;
  fragColor = vec4(col, 1.);
}`;

  function defaults() {
    return {
      scene: 0, medium: 0, shape: 1, arc: [-.15, 3, 0], cam: [0, 0, 1.8, 0], plane: [0, 0, 1, 0], split: 0,
      fx: [1, 0, -1, 0], fx2: [-1, 0, 1, 0], P: new Float32Array(32),
      holes: { ret: 0, lost: 0, your: -1, fall: -1, fresh: 0, gain: 1 },
    };
  }
  function postDefaults() {
    return { mix: 0, trans: 0, center: [.5, .5], blur: [0, 0, 0, 0], exposure: 1, bloom: .55, grain: .055, vignette: .75,
      aberr: .0015, defocus: 0, weave: 1, halation: .25, flash: 0, fade: 0, invert: 0, tint: [1, 1, 1] };
  }

  class Engine {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: !!opts.still, powerPreference: "high-performance" });
      if (!gl) throw new Error("This film needs WebGL2.");
      this.floatOK = !!gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");
      this.maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
      this.vao = gl.createVertexArray();
      this.dataW = 128; this.dataH = 16;
      this.data = new Float32Array(this.dataW * this.dataH * 4);
      this.dataTex = this._tex(this.dataW, this.dataH, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
      this.errors = "";
      this.nHoles = 0;
      this.w = this.h = 0;
    }
    // Every medium and every scene is its own small program. The compiler drops the code main() never
    // reaches, so each compiles in about a second, where one giant shader took about twenty.
    build(model) {
      const media = H.mediaDefs.slice().sort((a, b) => a.id - b.id), scenes = Object.values(H.scenes).sort((a, b) => a.id - b.id);
      const base = HEAD + H.glsl.common + H.glsl.plane(model) + `const float HOLE_R = ${model.GEO.HOLE_R.toFixed(4)};\n` + H.glsl.subject;
      const disp = list => `vec3 medium(int id, vec2 p, float d, vec2 n, Hole h) {\n` +
        list.map(m => `  if (id == ${m.id}) return ${m.fn}(p, d, n, h);`).join("\n") +
        `\n  return mix(vec3(.02), vec3(.55), fill(d, gPix));\n}\n`;
      const mainFor = fn => `void main() {
  vec2 fc = gl_FragCoord.xy, q = (fc - .5 * uRes) / uRes.y, suv = fc / uRes;
  vec2 p = uCam.xy + rot(uCam.w) * q * uCam.z;
  fragColor = vec4(max(${fn}(p, q, suv), 0.), 1.);
}`;
      const sceneText = scenes.map(s => s.glsl).filter((g, i, a) => a.indexOf(g) === i).join("\n");
      this.sources = { m0: base + disp([]) + H.glsl.subjectMain + mainFor("sceneSubject") };
      this.names = { m0: "medium fallback" };
      for (const m of media) { this.sources["m" + m.id] = base + (m.glsl || "") + disp([m]) + H.glsl.subjectMain + mainFor("sceneSubject"); this.names["m" + m.id] = "medium " + m.name; }
      for (const s of scenes) { this.sources["s" + s.id] = base + disp([]) + H.glsl.subjectMain + sceneText + "\n" + mainFor(s.fn); this.names["s" + s.id] = "scene " + s.fn; }
      // all the film's shader code, once, for the credits
      this.fsScene = [base, ...media.map(m => m.glsl || "").filter((g, i, a) => a.indexOf(g) === i), H.glsl.subjectMain, sceneText].join("\n");
      this.progs = {}; this.pending = {};
      this.progPost = this._prog(VS_QUAD, FS_POST, "post");
      this.progCrisp = this._prog(VS_HOLES, FS_CRISP, "holes");
      this.progGlow = this._prog(VS_HOLES, FS_GLOW, "glow");
      return !this.errors;
    }
    // Compile every scene program in the background (in parallel where the browser can).
    // Resolves with the error text ("" when all is well). Anything not ready when drawn compiles on the spot.
    compileAll(onProgress) {
      const gl = this.gl, ext = gl.getExtension("KHR_parallel_shader_compile");
      const keys = Object.keys(this.sources).filter(k => !this.progs[k] && !this.pending[k]), total = keys.length;
      const left = () => keys.filter(k => !this.progs[k]).length;
      return new Promise(res => {
        if (ext) {
          for (const k of keys) this.pending[k] = this._start(this.sources[k]);
          const tick = () => {
            for (const k of keys) {
              const p = this.pending[k];
              if (p && gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) { this.progs[k] = this._finish(p, this.names[k]); delete this.pending[k]; }
            }
            if (onProgress) onProgress(total - left(), total);
            if (left()) setTimeout(tick, 60); else res(this.errors);
          };
          tick();
        } else {
          // one program per tick, so the page keeps painting
          let i = 0;
          const step = () => {
            while (i < keys.length && this.progs[keys[i]]) i++;
            if (i >= keys.length) { res(this.errors); return; }
            const k = keys[i++];
            this.progs[k] = this._finish(this._start(this.sources[k]), this.names[k]);
            if (onProgress) onProgress(total - left(), total);
            setTimeout(step, 0);
          };
          step();
        }
      });
    }
    program(L) {
      let k = L.scene === 0 ? "m" + L.medium : "s" + L.scene;
      if (!this.sources[k]) k = "m0";
      if (!this.progs[k]) {
        if (this.pending[k]) { this.progs[k] = this._finish(this.pending[k], this.names[k]); delete this.pending[k]; }
        else this.progs[k] = this._prog(VS_QUAD, this.sources[k], this.names[k]);
      }
      return this.progs[k];
    }
    _start(fs, vs = VS_QUAD) {
      const gl = this.gl, p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s);
        s.src = src;
      }
      gl.linkProgram(p);
      return p;
    }
    _finish(p, name) {
      const gl = this.gl;
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        for (const s of gl.getAttachedShaders(p)) {
          if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) continue;
          const log = gl.getShaderInfoLog(s), lines = s.src.split("\n");
          const ctx = (log.match(/0:(\d+)/g) || []).slice(0, 4).map(m => { const n = +m.slice(2); return `${n}: ${lines[n - 1]}`; }).join("\n");
          this.errors += `[${name}] ${log}\n${ctx}\n`;
        }
        this.errors += `[${name} link] ${gl.getProgramInfoLog(p)}\n`;
      }
      const U = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i), key = u.name.replace(/\[0\]$/, ""); U[key] = gl.getUniformLocation(p, u.name); }
      p.U = new Proxy(U, { get: (o, k) => o[k] ?? null });   // uniforms a program never reads are simply skipped
      return p;
    }
    _prog(vs, fs, name) { return this._finish(this._start(fs, vs), name); }
    _tex(w, h, internal, format, type, filter, mip) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    _fbo(tex, depth) {
      const gl = this.gl, f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      return f;
    }
    resize(w, h) {
      w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
      if (w === this.w && h === this.h) return;
      const gl = this.gl;
      this.w = this.canvas.width = w; this.h = this.canvas.height = h;
      for (const k of ["tA", "tB", "tHole", "tGlow"]) if (this[k]) gl.deleteTexture(this[k]);
      for (const k of ["fA", "fB", "fHole", "fGlow"]) if (this[k]) gl.deleteFramebuffer(this[k]);
      if (this.depth) gl.deleteRenderbuffer(this.depth);
      this.tA = this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, true);
      this.tB = this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, true);
      this.tHole = this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      const gw = Math.ceil(w / 2), gh = Math.ceil(h / 2);
      this.tGlow = this.floatOK ? this._tex(gw, gh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR) : this._tex(gw, gh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      this.glowW = gw; this.glowH = gh;
      this.depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      this.fA = this._fbo(this.tA); this.fB = this._fbo(this.tB);
      this.fHole = this._fbo(this.tHole, this.depth); this.fGlow = this._fbo(this.tGlow);
    }
    // holes: [{x, y, seed?, lost, order, sortie, ghost, z}]
    setHoles(holes) {
      const gl = this.gl, a = new Float32Array(holes.length * 8);
      holes.forEach((h, i) => { a.set([h.x, h.y, h.seed ?? ((i * 0.6180339887) % 1), h.lost ? 1 : 0, h.order, h.sortie, h.ghost, h.z], i * 8); });
      gl.bindVertexArray(this.vao);
      if (!this.vbo) this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      this.nHoles = holes.length;
    }
    dataRow(r, i, x, y, z, w) { const k = (r * this.dataW + i) * 4; this.data[k] = x; this.data[k + 1] = y; this.data[k + 2] = z; this.data[k + 3] = w; }
    _holePass(prog, fbo, w, h, L, time, glow) {
      const gl = this.gl, U = prog.U, Hs = L.holes;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      if (glow) { gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
      else { gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); }
      if (this.nHoles && (Hs.ret > 0 || Hs.lost > 0)) {
        gl.useProgram(prog);
        gl.uniform2f(U.uRes, w, h); gl.uniform4fv(U.uCam, L.cam); gl.uniform4fv(U.uPlane, L.plane);
        gl.uniform1f(U.uSplit, L.split); gl.uniform1f(U.uShowRet, Hs.ret); gl.uniform1f(U.uShowLost, Hs.lost);
        gl.uniform1f(U.uYour, Hs.your); gl.uniform1f(U.uHoleR, H.model.GEO.HOLE_R); gl.uniform1f(U.uFresh, Hs.fresh);
        gl.uniform1f(U.uFall, Hs.fall); gl.uniform1f(U.uTime, time); gl.uniform1i(U.uGhostRow, 8);
        gl.uniform1f(U.uR, glow ? 6.5 : 2.5); gl.uniform1f(U.uGlowPass, glow ? 1 : 0);
        if (U.uGain) gl.uniform1f(U.uGain, (this.floatOK ? 1 : .25) * Hs.gain);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dataTex); gl.uniform1i(U.uData, 2);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, this.nHoles);
      }
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    }
    _scene(L, fbo, tex, time) {
      const gl = this.gl;
      if (L.scene === 0 || L.holesAlways) {
        this._holePass(this.progCrisp, this.fHole, this.w, this.h, L, time, false);
        this._holePass(this.progGlow, this.fGlow, this.glowW, this.glowH, L, time, true);
      }
      const P = this.program(L), U = P.U;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, this.w, this.h);
      gl.useProgram(P);
      gl.uniform2f(U.uRes, this.w, this.h); gl.uniform1f(U.uTime, time); gl.uniform4fv(U.uCam, L.cam);
      gl.uniform1i(U.uScene, L.scene); gl.uniform1i(U.uMedium, L.medium); gl.uniform1f(U.uShape, L.shape);
      gl.uniform3fv(U.uArc, L.arc); gl.uniform4fv(U.uPlane, L.plane); gl.uniform1f(U.uSplit, L.split);
      gl.uniform4fv(U.uFX, L.fx); gl.uniform4fv(U.uFX2, L.fx2);
      if (U.uP) gl.uniform4fv(U.uP, L.P);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tHole); gl.uniform1i(U.uHole, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tGlow); gl.uniform1i(U.uGlow, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.dataTex); gl.uniform1i(U.uData, 2);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    render(A, B, post, time) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.dataW, this.dataH, gl.RGBA, gl.FLOAT, this.data);
      this._scene(A, this.fA, this.tA, time);
      const mixing = B && post.mix > 0;
      if (mixing) this._scene(B, this.fB, this.tB, time);
      const P = this.progPost, U = P.U;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
      gl.useProgram(P);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tA); gl.uniform1i(U.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tB); gl.uniform1i(U.uB, 1);
      gl.uniform2f(U.uRes, this.w, this.h); gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uMix, mixing ? post.mix : 0); gl.uniform1i(U.uTrans, post.trans); gl.uniform2fv(U.uCenter, post.center);
      gl.uniform4fv(U.uBlur, post.blur);
      gl.uniform4f(U.uLook, post.exposure, post.bloom, post.grain, post.vignette);
      gl.uniform4f(U.uLook2, post.aberr, post.defocus, post.weave, post.halation);
      gl.uniform4f(U.uFade, post.flash, post.fade, 0, post.invert);
      gl.uniform3fv(U.uTint, post.tint);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  H.Engine = Engine;
  H.layer = defaults;
  H.post = postDefaults;
})();
