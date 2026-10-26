import test from "node:test";
import assert from "node:assert/strict";
import {
  StableGestureDetector,
  TemporalGestureDetector,
  PoseStabilityGate,
  averageVectors,
  classifyLandmarkVector,
  cosineSimilarity,
  findBestMatch,
  findBestSequenceMatch,
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
  assert.equal(vector.length, 134);
  assert.ok(vector.some((value) => value !== 0));
});

test("landmarksToVector canonicalizes a one-hand sign across handedness", () => {
  const landmarks = Array.from({ length: 21 }, (_, index) => ({
    x: index * 0.01,
    y: index * 0.02,
    z: index * -0.001
  }));
  const mirrored = landmarks.map((point) => ({ ...point, x: -point.x }));
  const right = landmarksToVector({ landmarks: [landmarks], handedness: [[{ categoryName: "Right" }]] });
  const left = landmarksToVector({ landmarks: [mirrored], handedness: [[{ categoryName: "Left" }]] });
  assert.ok(cosineSimilarity(right, left) > 0.999);
});

test("classifyLandmarkVector returns the confident trained class", () => {
  const match = classifyLandmarkVector([2, 0], {
    featureCount: 2,
    classes: ["A", "B"],
    mean: [0, 0],
    scale: [1, 1],
    coef: [[2, 0], [-2, 0]],
    intercept: [0, 0],
    confidenceThreshold: 0.58,
    marginThreshold: 0.12
  });
  assert.equal(match.gloss, "A");
  assert.ok(match.score > 0.99);
});

test("PoseStabilityGate suppresses transitions and returns a settled average", () => {
  const gate = new PoseStabilityGate({ windowMs: 400, minFrames: 5, maxAverageMotion: 0.04, maxPeakMotion: 0.11 });
  for (let index = 0; index < 6; index += 1) {
    assert.equal(gate.update([index * 0.2, 0], index * 80), null);
  }
  let stable = null;
  for (let index = 6; index < 13; index += 1) stable = gate.update([1, 0], index * 80);
  assert.deepEqual(stable, [1, 0]);
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

test("findBestSequenceMatch identifies a temporal word", () => {
  const frames = Array.from({ length: 24 }, () => [1, 0]);
  const match = findBestSequenceMatch(frames, {
    TEAM: { sequence: Array.from({ length: 12 }, () => [1, 0]) },
    STOP: { sequence: Array.from({ length: 12 }, () => [0, 1]) }
  });
  assert.equal(match.gloss, "TEAM");
  assert.ok(match.score > 0.99);
  assert.ok(match.margin > 0.9);
});

test("TemporalGestureDetector accepts a stable sequence match", () => {
  const accepted = [];
  const detector = new TemporalGestureDetector({
    templates: {
      TEAM: { sequence: Array.from({ length: 12 }, () => [1, 0]) },
      STOP: { sequence: Array.from({ length: 12 }, () => [0, 1]) }
    },
    holdMs: 320,
    onAccept: (match) => accepted.push(match.gloss)
  });
  for (let index = 0; index < 24; index += 1) detector.update([1, 0], index * 170);
  assert.deepEqual(accepted, ["TEAM"]);
});
