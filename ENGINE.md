# How the film is drawn

Everything on screen is computed live by WebGL2 shaders written for this film: no images, no video, no libraries.
Classic `<script>` files share one global, `window.HOLES`, so the page runs from `file://` with no server.

| file | owns |
|---|---|
| `model.js` | the B-17 plan-view geometry (wingspan 2 units, nose toward +y), zones, the seeded simulation of 300 sorties |
| `glsl-common.js` | shared GLSL: hashes, noise, fbm, `warp`, `voronoi`, SDFs, the plane SDF generated from `model.js`, the hole lookup, scene 0 |
| `engine.js` | passes: hole field, hole glow, scene layers A/B, post (transitions, bloom, grain, weave, flash, fade) |
| `media-core.js` | medium 1, `thermal` (the honest data view) |
| `media-a.js`, `media-b.js` | the other art media (ids 10-19 and 20-29) |
| `scene-sky.js` | scene 1, the raid above the clouds |
| `scene-field.js` | scene 2, the airfield at home; scene 3, the airfield at night with the ghosts |
| `audio.js` | the synthesized score and sound effects (WebAudio) |
| `film.js`, `index.html` | the director: story, words, interaction, camera, transitions |
| `lab.html` | still-frame bench for any scene or medium, driven by URL parameters |

## Programs

Every medium and every scene is its own small shader program. Each program includes all the shared code, but its `main()` reaches only one medium or scene, and the compiler drops the rest.
- **Why:** one giant shader took about 20 s to compile; a single medium takes about 1 s.
- **Film:** `compileAll()` compiles the programs in parallel (`KHR_parallel_shader_compile`) while the title shows.
- **Lab:** compiles only what it draws, when it draws it.
- **Failures:** a program that fails to compile falls back to the plain fallback program (`m0`) and is logged.

## Coordinates

- `q`: screen position, y from -0.5 (bottom) to 0.5 (top), x scaled by the aspect ratio (2.39:1 frame, so x is about ±1.2).
- `p`: world position, `p = uCam.xy + rot(uCam.w) * q * uCam.z`. `uCam.z` is the visible world height.
- Plane space: `toPlane(p)`; the whole B-17 fits in a circle of radius 1.05 around the origin.
- `gPix` is one pixel in world units. Anti-alias with `fill(d, gPix * 1.5)` and `stroke(d, halfWidth, gPix * 1.5)`.

## A medium

```glsl
vec3 m_<name>(vec2 p, float d, vec2 n, Hole h)
```

- `d` is the signed distance to the subject (negative inside), and `n` is the outward normal.
  The subject is a great arc (`uShape = 0`, the top of a huge circle) or the plane (`uShape = 1`); it may morph between them.
  A medium must look right for both.
- `h` is the bullet hole under the pixel. `h.on` says whether there is one, and `h.r` is the distance from its centre in hole radii
  (1 = the hole's edge; the sprite reaches out to 2.5, so rims, petals and halos can be drawn around it). `h.o` is the offset in hole radii,
  `h.seed` is a 0..1 random number per hole, and `h.kind` is 1 (came home), 2 (lost), 3 or 4 (the viewer's own plane).
  `h.dens` and `h.densLost` are smooth hole densities, `h.fresh` flashes as a hole lands, and `h.gold` glows around the viewer's holes.
- Globals: `gLocal` (plane-space position, attached to the plane as it moves; arc-local for the arc), `gZone` (0 engines,
  1 wings and tail, 2 fuselage, -1 outside), `gSide`, `gPix`, and the uniforms `uTime`, `uFX` (heat gain, lost-heat gain,
  armour zone, armour progress), `uFX2` (hover zone, hover amount, draw-on progress 0..1, spare).
- Register it: `HOLES.mediaDefs.push({ id, name, ink: "light" | "dark", fn: "m_<name>", glsl })`.
  `ink` is the colour of words set above the subject: light words on dark media, dark words on light media.
- Prefix every helper with your file's prefix (`ma_`, `mb_`), because all media share one shader.

## A scene

```js
HOLES.scenes.sky = { id: 1, fn: "sceneSky", glsl: "vec3 sceneSky(vec2 p, vec2 q, vec2 suv) { ... }", update(t, L, E, ctx) { ... } }
```

`update` runs every frame before drawing. It fills the instance rows with `E.dataRow(row, i, x, y, z, w)`
(an RGBA32F texture, 128 wide, read in GLSL with `row(r, i)`), and may set `L.cam` (the camera) and `L.P` (8 vec4 params, `uP[i]`).

| rows | owner |
|---|---|
| 0-7 | scene 1, the sky |
| 8 | the director's ghosts over scene 0: x, y, heading, scale (world). The holes of lost planes fall from here |
| 9 | the director's ghosts: alpha, glow, gold, spare |
| 10-15 | scenes 2 and 3, the field and the night |

`ctx` holds `sim` (the simulation), `your` (the viewer's sortie: `{ id, hits: [{x, y, z}], lost, fatal }`),
and scene-specific clocks, which are described in each scene file.

## Checking your work

Open `lab.html` from disk with URL parameters. It shows any shader compile error on the page, so a headless browser's screenshot or DOM dump works as a test. For example:

```
lab.html?medium=thermal                          one medium on the plane
lab.html?sheet=plane&ret=all&gain=.12            every medium on the plane, with all the holes, as a contact sheet
index.html?still=reveal@20&fate=lost&choice=1    one frame of the film at any moment (also strip=open@2,raid@20,...)
perf.html                                        compile time and GPU time per frame on this machine
```

Useful lab parameters: `medium=<name|id>`, `sheet=plane|arc` (all media), `shape=0..1`, `cam=x,y,zoom,rot`, `ret=<n|all>`,
`lost=<n|all>`, `your=home|lost`, `gain=` (heat per hole), `fx=`, `fx2=`, `scene=<id>`, `t=` (seconds), `p0..p7=`, `anim=1`, `w=`, `h=`.
