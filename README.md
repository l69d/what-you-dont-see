# What You Don’t See

A short interactive film, about four minutes long, about the hits nobody counted. Made for the **Claude Opus Build Day**.

**Play it:** https://l69d.github.io/what-you-dont-see/ (best with sound, on a laptop or larger screen)

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

## At the booth

- **Warm the shader cache.** Open the film once before visitors arrive and wait for Begin. The first load compiles 25 shader programs (up to half a minute on a busy laptop). Chrome caches them, so later loads take about a second.
- **Check the laptop.** `perf.html` reports the compile time and the GPU time per frame for every medium and scene. Frames over about 16 ms fall below 60 fps; the film then lowers its render scale by itself.
- **Leave it unattended.** Left waiting for input for 75 s, the film returns to the title for the next visitor.

## The numbers

The story's data is a simulation, in `model.js`. There are 300 sorties:
- Each plane takes 1 + Poisson(2.2) hits, spread uniformly over a B-17 in plan view.
- A hit in an engine brings the plane down 42% of the time. A hit anywhere else does so 1% of the time.
- With seed 168, 250 planes come home and 50 are lost, the one in six of 1943's worst raids.

The film's headline number is the share of planes with at least one hole in each part:

| share of planes hit | came home (250) | never came back (50) |
|---|---|---|
| engines | 19% | 82% |
| wings and tail | 90% | 80% |
| fuselage | 54% | 52% |

(As holes per plane: engines 0.2 against 1.0, wings and tail 2.1 against 2.0, fuselage 0.7 against 0.7.)

The engines are the only part where the two groups differ. The planes hit there are missing from the count, so the survivors' engines look safe.

The heat maps are honest:
- While the holes land, the heat is their density. Every hole is splatted with the same kernel.
- In the split view, each side is divided by its own number of planes (250 and 50), so the two are compared per plane.
- Then the pattern resolves: each part is filled by its share of planes hit, the number on screen.
- `test_model.mjs` checks every number above.
- `test_film.py` runs it and checks that the pages load nothing from the network.

The viewer's own plane is one of the 300 sorties, drawn at random. It is lost with the data's own probability: 50 in 300.

## Honesty notes

- **The reasoning is Wald's.** Abraham Wald worked at the Statistical Research Group at Columbia University in New York. His 1943 memoranda, *A Method of Estimating Plane Vulnerability Based on Damage of Survivors* (reprinted by the Center for Naval Analyses in 1980), estimate how vulnerable each part of a plane is from the damage on the planes that returned. The same argument is told here as a story. See Mangel and Samaniego, "Abraham Wald's Work on Aircraft Survivability", *Journal of the American Statistical Association* 79 (1984).
- **The simulation is illustrative.** The planes, holes, hit rates and seed are made up to tell that argument clearly. They are not Wald's data.
- **"One bomber in six"** is the loss rate of the worst raids of 1943. On the Schweinfurt–Regensburg mission of 17 August 1943, 60 of 376 B-17s were lost.
- **The survivorship examples** in the echo (old buildings, old songs, fortunes, old trees) are the familiar illustrations of the same bias. They are not data.

## How it's made

See `ENGINE.md`. The film was written with Claude. Claude also directed a team of parallel agents that painted the art media (`media-a.js`, `media-b.js`), the raid (`scene-sky.js`), the airfield by day and night (`scene-field.js`) and the score (`audio.js`) against one shared engine and contract. `lab.html` renders any scene, medium or moment as a still, for checking the art. `audio-test.html` measures every sound on its own, and `audio-mix.html` renders the whole film's mix offline: loudness per chapter, true peak, bass share and clicks. At the end of the film, **Explore the cost** shows the tokens and time the film took, measured from the session transcripts (`making-of.js`), and **The team** shows who made it.

## Contributors

- [Karthik (@l69d)](https://github.com/l69d)
- [vikas kumawat (@vikaskumawat)](https://github.com/vikaskumawat)
- [ATHUL VR (@Athullvr)](https://github.com/Athullvr)
- Claude (Anthropic), with a team of Claude agents
