import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAslLetter, normalizeAslHand } from "../src/asl/alphabet.js";
import { detectMotionLetter } from "../src/asl/motion.js";

const model = JSON.parse(readFileSync(new URL("../assets/asl/alphabet-model.json", import.meta.url)));
const seed = JSON.parse(readFileSync(new URL("./fixtures/asl-fingerspelling-seed.json", import.meta.url)));

test("static model maps every A–I and K–Y label", () => {
  assert.equal(model.labels.join(""), "ABCDEFGHIKLMNOPQRSTUVWXY");
  for (const label of model.labels) assert.ok(seed.some((sample) => sample.label === label));
});

test("supplied static examples retain their known mapping", () => {
  const correct = seed.filter((sample) => classifyAslLetter(sample.features, model)?.gloss === sample.label).length;
  assert.equal(correct, 282);
});

test("HandLandmarker Left is mirrored to the model convention", () => {
  const points = Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + i * 0.005, y: 0.2 + i * 0.003, z: i * 0.001 }));
  const left = normalizeAslHand({ side: "left", points });
  const mirrored = normalizeAslHand({ side: "right", points: points.map(({ x, y, z }) => ({ x: 1 - x, y, z })) });
  for (let i = 0; i < left.length; i++) assert.ok(Math.abs(left[i] - mirrored[i]) < 1e-9);
});

function samples(knots, tip) {
  const positions = [];
  for (let k = 0; k < knots.length - 1; k++) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8;
      positions.push({ x: knots[k][0] + (knots[k + 1][0] - knots[k][0]) * a,
        y: knots[k][1] + (knots[k + 1][1] - knots[k][1]) * a });
    }
  }
  positions.push({ x: knots.at(-1)[0], y: knots.at(-1)[1] });
  return positions.map((point) => {
    const points = Array.from({ length: 21 }, () => ({ x: point.x, y: point.y, z: 0 }));
    points[9] = { x: point.x, y: point.y + 0.1, z: 0 };
    points[tip] = { x: point.x, y: point.y, z: 0 };
    return { points };
  });
}

test("motion traces cover J and Z and reject static holds", () => {
  assert.equal(detectMotionLetter("I", samples([[0.1, 0.1], [0.105, 0.165], [0.12, 0.2], [0.165, 0.18]], 20))?.gloss, "J");
  assert.equal(detectMotionLetter("D", samples([[0.1, 0.1], [0.2, 0.1], [0.1, 0.2], [0.2, 0.2]], 8))?.gloss, "Z");
  assert.equal(detectMotionLetter("I", samples([[0.1, 0.1], [0.1, 0.1]], 20)), null);
  assert.equal(detectMotionLetter("D", samples([[0.1, 0.1], [0.2, 0.1]], 8)), null);
});
