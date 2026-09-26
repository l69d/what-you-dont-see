# Where the holes aren’t

A short interactive film, about four minutes long, about the bullet holes nobody counted.

You ride in a B-17 over Germany in 1943, and it may not come home. You count the holes in the planes that did. You decide where the armour goes. Then Abraham Wald asks his question, and the planes that never came back rise over their empty hardstands to answer it.

Open `index.html` in a browser; it runs offline, straight from disk. Every frame is drawn live by WebGL2 shaders written for this film, and every sound is synthesized in WebAudio. There are no images, no video and no libraries.

## Controls

| where | what you do |
|---|---|
| the raid | click your plane (the gold outline) to take your seat |
| the count | press and hold, anywhere or on the button, or hold Space |
| the decision | click a part of the plane, or press 1, 2 or 3 |
| any time | M mutes the sound |

URL options:
- `?talk` switches off the idle reset (the film returns to the title after 75 s waiting for input) and lets ← and → jump between chapters.
- `?fate=lost` or `?fate=home` forces what happens to your plane.
- `?at=reveal` starts a chapter straight after Begin.
- `?hq` renders at the screen's full pixel density.

## The numbers

The story's data is a simulation, in `model.js`. There are 300 sorties:
- Each plane takes 1 + Poisson(2.2) hits, spread uniformly over a B-17 in plan view.
- A hit in an engine brings the plane down 42% of the time. A hit anywhere else does so 1% of the time.
- With seed 168, 250 planes come home and 50 are lost, the one in six of 1943's worst raids.

| holes per plane | came home (250) | never came back (50) |
|---|---|---|
| engines | 0.2 | 1.0 |
| wings and tail | 2.1 | 2.0 |
| fuselage | 0.7 | 0.7 |

The engines are the only part where the two groups differ. The planes hit there are missing from the count, so the survivors' engines look safe.

The heat maps are honest densities:
- Every hole is splatted with the same kernel.
- In the split view each side is divided by its own number of planes (250 and 50), so the two are compared per plane.
- `test_model.mjs` checks every number above.
- `test_film.py` runs it and checks that the pages load nothing from the network.

The viewer's own plane is one of the 300 sorties, drawn at random. It is lost with the data's own probability: 50 in 300.

## Honesty notes

- **The reasoning is Wald's.** Abraham Wald worked at the Statistical Research Group at Columbia University in New York. His 1943 memoranda, *A Method of Estimating Plane Vulnerability Based on Damage of Survivors* (reprinted by the Center for Naval Analyses in 1980), estimate how vulnerable each part of a plane is from the damage on the planes that returned. The same argument is told here as a story. See Mangel and Samaniego, "Abraham Wald's Work on Aircraft Survivability", *Journal of the American Statistical Association* 79 (1984).
- **The simulation is illustrative.** The planes, holes, hit rates and seed are made up to tell that argument clearly. They are not Wald's data.
- **"One bomber in six"** is the loss rate of the worst raids of 1943. On the Schweinfurt–Regensburg mission of 17 August 1943, 60 of 376 B-17s were lost.
- **The survivorship examples** in the echo (old buildings, old songs, fortunes, old trees) are the familiar illustrations of the same bias. They are not data.

## How it's made

See `ENGINE.md`. The film was written with Claude. Claude also directed a team of parallel agents that painted the art media (`media-a.js`, `media-b.js`), the raid (`scene-sky.js`), the airfield by day and night (`scene-field.js`) and the score (`audio.js`) against one shared engine and contract. `lab.html` renders any scene, medium or moment as a still, for checking the art.
