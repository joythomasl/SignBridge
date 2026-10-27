import * as tflite from "@tensorflow/tfjs-tflite/dist/tf-tflite.fesm.js";
import { decodeFingerspelling } from "./kaggle-io.js";

// The official model has a dynamic T dimension, but the browser wrapper has
// no resize API. Patch a fresh copy of the verified FlatBuffer for each input
// length, then release the previous interpreter before loading the next one.
const FEATURES = 390;
const MODEL_BYTES = 40946288;
const SHAPE_OFFSET = 40945460;
const SIGNATURE_OFFSET = 40945408;
const MAX_FRAMES = 384;

function prepareModel(buffer, frames) {
  if (buffer.byteLength !== MODEL_BYTES) throw new Error("Unexpected Kaggle model size");
  const view = new DataView(buffer);
  if (view.getInt32(SHAPE_OFFSET, true) !== 1 || view.getInt32(SHAPE_OFFSET + 4, true) !== FEATURES ||
      view.getInt32(SIGNATURE_OFFSET, true) !== -1 || view.getInt32(SIGNATURE_OFFSET + 4, true) !== FEATURES) {
    throw new Error("Unexpected Kaggle model input layout");
  }
  view.setInt32(SHAPE_OFFSET, frames, true);
  view.setInt32(SIGNATURE_OFFSET, frames, true);
  return buffer;
}

function fitFrames(rows) {
  if (rows.length < 8) throw new Error("Too few frames for sequence recognition");
  const frames = Math.min(rows.length, MAX_FRAMES);
  const output = new Float32Array(frames * FEATURES);
  if (frames === rows.length) {
    for (let t = 0; t < frames; t++) output.set(rows[t], t * FEATURES);
    return output;
  }
  for (let t = 0; t < frames; t++) {
    const position = t * (rows.length - 1) / (frames - 1);
    const lo = Math.floor(position), hi = Math.min(lo + 1, rows.length - 1), weight = position - lo;
    for (let k = 0; k < FEATURES; k++) {
      const a = rows[lo][k], b = rows[hi][k];
      output[t * FEATURES + k] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * weight : Number.NaN;
    }
  }
  return output;
}

export async function loadKaggleModel(url) {
  const [bytes, schema, characterMap] = await Promise.all([
    fetch(url("assets/asl/fingerspelling-model.tflite")).then((response) => response.arrayBuffer()),
    fetch(url("assets/asl/inference_args.json")).then((response) => response.json()),
    fetch(url("assets/asl/character_to_prediction_index.json")).then((response) => response.json())
  ]);
  if (schema.selected_columns?.length !== FEATURES) throw new Error("Invalid Kaggle feature schema");
  tflite.setWasmPath(url("vendor/tflite/"));
  let runner = null;
  let currentFrames = 0;
  async function runnerFor(frames) {
    if (runner && currentFrames === frames) return runner;
    runner?.cleanUp();
    runner = null;
    const model = await tflite.loadTFLiteModel(prepareModel(bytes.slice(0), frames), { numThreads: 1 });
    const next = model.modelRunner;
    if (!next || next.getInputs()[0]?.data().length !== frames * FEATURES) {
      next?.cleanUp();
      throw new Error("TFLite input unavailable");
    }
    runner = next;
    currentFrames = frames;
    return runner;
  }
  await runnerFor(128);
  return {
    columns: schema.selected_columns,
    async transcribe(rows) {
      const input = fitFrames(rows);
      const modelRunner = await runnerFor(input.length / FEATURES);
      modelRunner.getInputs()[0].data().set(input);
      if (!modelRunner.infer()) throw new Error("TFLite inference failed");
      const output = modelRunner.getOutputs()[0];
      return decodeFingerspelling(output.data(), output.shape, characterMap);
    }
  };
}
