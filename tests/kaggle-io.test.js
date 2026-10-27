import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeFingerspelling, kaggleFrame } from "../src/asl/kaggle-io.js";

const columns = JSON.parse(readFileSync(new URL("../assets/asl/inference_args.json", import.meta.url))).selected_columns;
const characters = JSON.parse(readFileSync(new URL("../assets/asl/character_to_prediction_index.json", import.meta.url)));

test("winner feature schema maps all 390 face, hand, and pose coordinates", () => {
  assert.equal(columns.length, 390);
  const result = {
    faceLandmarks: [[{ x: 0.1, y: 0.2, z: 0.3 }]],
    leftHandLandmarks: [[{ x: 0.4, y: 0.5, z: 0.6 }]],
    rightHandLandmarks: [[{ x: 0.7, y: 0.8, z: 0.9 }]],
    poseLandmarks: [Array.from({ length: 33 }, (_, i) => ({ x: i, y: i + 1, z: i + 2 }))]
  };
  const frame = kaggleFrame(result, columns);
  assert.equal(frame.length, 390);
  for (const [name, value] of [["x_face_0", 0.1], ["y_left_hand_0", 0.5], ["z_right_hand_0", 0.9], ["x_pose_12", 12]]) {
    assert.equal(frame[columns.indexOf(name)], value);
  }
  assert.ok(Number.isNaN(frame[columns.indexOf("x_face_61")]));
});

test("winner logits decode letters and stop at the first special token", () => {
  const logits = new Float32Array(4 * 63).fill(-10);
  logits[characters.h] = 10;
  logits[63 + characters.i] = 10;
  logits[2 * 63 + 60] = 10;
  logits[3 * 63 + characters.z] = 10;
  const result = decodeFingerspelling(logits, "4,63", characters);
  assert.equal(result.text, "hi");
  assert.ok(result.score > 0.99);
});
