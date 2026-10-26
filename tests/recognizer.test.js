import test from "node:test";
import assert from "node:assert/strict";
import {
  StableGestureDetector,
  averageVectors,
  cosineSimilarity,
  findBestMatch,
  landmarksToVector
} from "../src/recognizer.js";

test("averageVectors computes a component-wise average", () => {
  assert.deepEqual(averageVectors([[1, 2], [3, 4]]), [2, 3]);
});

test("cosineSimilarity identifies aligned vectors", () => {
  assert.equal(cosineSimilarity([1, 0, 1], [2, 0, 2]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("findBestMatch returns the closest calibrated gloss", () => {
  const match = findBestMatch([1, 0], {
    YES: { vector: [0.99, 0.01] },
    NO: { vector: [0, 1] }
  });
  assert.equal(match.gloss, "YES");
  assert.ok(match.score > 0.99);
});

test("landmarksToVector has a fixed two-hand vector length", () => {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: index * 0.01,
    y: index * 0.02,
    z: index * -0.001
  }));
  const vector = landmarksToVector({
    landmarks: [landmarks],
    handedness: [[{ categoryName: "Right" }]]
  });
  assert.equal(vector.length, 126);
  assert.ok(vector.some((value) => value !== 0));
});

test("StableGestureDetector accepts only after the hold duration", () => {
  const accepted = [];
  const detector = new StableGestureDetector({
    threshold: 0.9,
    holdMs: 500,
    cooldownMs: 900,
    onAccept: (match) => accepted.push(match.gloss)
  });
  detector.update({ gloss: "YES", score: 0.95 }, 0);
  detector.update({ gloss: "YES", score: 0.96 }, 499);
  assert.deepEqual(accepted, []);
  detector.update({ gloss: "YES", score: 0.96 }, 500);
  assert.deepEqual(accepted, ["YES"]);
  detector.update({ gloss: "YES", score: 0.99 }, 700);
  assert.deepEqual(accepted, ["YES"]);
  detector.update({ gloss: "YES", score: 0.99 }, 1500);
  detector.update({ gloss: "YES", score: 0.99 }, 2100);
  assert.deepEqual(accepted, ["YES"]);
  detector.update({ gloss: null, score: 0 }, 2200);
  detector.update({ gloss: "YES", score: 0.99 }, 2300);
  detector.update({ gloss: "YES", score: 0.99 }, 2800);
  assert.deepEqual(accepted, ["YES", "YES"]);
});
