// node holes/test_model.mjs — checks the numbers the film puts on screen.
import { createRequire } from "module";
import assert from "assert/strict";
const M = createRequire(import.meta.url)("./model.js");

const S = M.simulate();
assert.equal(S.sorties.length, 300);
assert.equal(S.back, 250, "250 of 300 come home");
assert.equal(S.lost, 50, "one in six is lost");
assert.equal(S.retHoles + S.lostHoles, S.holes.length);

// every hole is on the airframe, in the zone it says
for (const h of S.holes) {
  assert.ok(M.planeD(h.x, h.y) < 0, "hole on the plane");
  assert.equal(M.zoneAt(h.x, h.y), h.z);
}

// the story's numbers: holes per plane, planes that came home vs planes that didn't
const [eng, wings, fus] = M.stats(S);
assert.equal(eng.back.toFixed(1), "0.2", "engines, home");
assert.equal(eng.lost.toFixed(1), "1.0", "engines, lost");
assert.ok(eng.lost > 4 * eng.back, "the engine gap");
for (const z of [wings, fus]) {
  const k = z.lost / z.back;
  assert.ok(k > .8 && k < 1.25, `${z.zone} about equal (${k.toFixed(2)})`);
}
assert.ok(wings.back > fus.back && fus.back > eng.back, "the most holes are on the wings and tail");

// the headline on screen: the share of planes hit in each part
const pct = v => Math.round(v * 100);
const [engS, wingsS, fusS] = M.shareHit(S);
assert.deepEqual([pct(engS.back), pct(engS.lost)], [19, 82], "engines: 19% of the planes that came home, 82% of the lost");
assert.deepEqual([pct(wingsS.back), pct(wingsS.lost)], [90, 80], "wings and tail");
assert.deepEqual([pct(fusS.back), pct(fusS.lost)], [54, 52], "fuselage");
assert.ok(engS.lost > 4 * engS.back, "the engine gap, in planes");
for (const z of [wingsS, fusS]) assert.ok(Math.abs(z.lost - z.back) < .15, `${z.zone}: about the same either way`);
assert.ok(wingsS.back > fusS.back && fusS.back > engS.back, "on the survivors, the wings and tail look like the place to armour");

// a lost plane always has a fatal hit; a plane that came home never does
for (const s of S.sorties) assert.equal(s.lost, s.fatal >= 0);
// ghosts are numbered 0..49 in sortie order
assert.deepEqual(S.sorties.filter(s => s.lost).map(s => s.ghost), [...Array(50).keys()]);

// the viewer's plane can be forced for demos, and is otherwise one of the 300
const r = M.rng(1);
assert.ok(M.pickSortie(S, r, "lost").lost);
assert.ok(!M.pickSortie(S, r, "home").lost);
assert.ok(S.sorties.includes(M.pickSortie(S, r)));

// deterministic
assert.deepEqual(M.simulate().holes.slice(0, 20), S.holes.slice(0, 20));
console.log("model ok", S.back, "home,", S.lost, "lost;", M.stats(S).map(z => `${z.zone} ${z.back.toFixed(1)}/${z.lost.toFixed(1)}`).join(", "));
