import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyAslLetter, normalizeAslHand } from "../src/asl/alphabet.js";

const model = JSON.parse(readFileSync(new URL("../assets/asl/alphabet-model.json", import.meta.url)));
const seed = JSON.parse(readFileSync(new URL("./fixtures/asl-fingerspelling-seed.json", import.meta.url)));

test("ASL static alphabet covers 24 letters and excludes motion J and Z", () => {
  assert.equal(model.labels.length, 24);
  assert.equal(model.labels.join(""), "ABCDEFGHIKLMNOPQRSTUVWXY");
});

test("ASL model retains its supplied seed mapping", () => {
  const correct = seed.filter((sample) => classifyAslLetter(sample.features, model)?.gloss === sample.label).length;
  assert.equal(correct, 282);
});

test("Holistic body side is converted to the source model's handedness convention", () => {
  const points = Array.from({ length: 21 }, (_, i) => ({
    x: 0.4 + i * 0.005,
    y: 0.2 + i * 0.003,
    z: i * 0.001
  }));
  const right = normalizeAslHand({ side: "right", points });
  const mirrored = normalizeAslHand({
    side: "left",
    points: points.map(({ x, y, z }) => ({ x: 1 - x, y, z }))
  });
  for (let i = 0; i < right.length; i++) assert.ok(Math.abs(right[i] - mirrored[i]) < 1e-9);
});
