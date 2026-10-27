import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LetterDecoder } from "../src/asl/letter-decoder.js";

const model = JSON.parse(readFileSync(new URL("../assets/asl/alphabet-model.json", import.meta.url)));
const seed = JSON.parse(readFileSync(new URL("./fixtures/asl-fingerspelling-seed.json", import.meta.url)));

function hand(label) {
  const sample = seed.find((item) => item.label === label);
  return { side: "right", points: Array.from({ length: 21 }, (_, index) => ({
    x: 0.5 + sample.features[index * 3] * 0.1,
    y: 0.5 + sample.features[index * 3 + 1] * 0.1,
    z: sample.features[index * 3 + 2] * 0.1
  })) };
}

test("a held letter commits once on hand release and can be repeated", () => {
  const decoder = new LetterDecoder(model);
  const a = hand("A");
  for (let time = 0; time <= 700; time += 70) assert.deepEqual(decoder.push(a, time).accepted, []);
  assert.deepEqual(decoder.push(null, 900).accepted.map((item) => item.gloss), ["A"]);
  assert.deepEqual(decoder.push(null, 1000).accepted, []);
  for (let time = 1200; time <= 1900; time += 70) decoder.push(a, time);
  assert.deepEqual(decoder.push(null, 2100).accepted.map((item) => item.gloss), ["A"]);
});
