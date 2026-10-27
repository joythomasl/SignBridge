import * as tflite from "@tensorflow/tfjs-tflite/dist/tf-tflite.fesm.js";
import { decodeFingerspelling } from "./kaggle-io.js";

// The official v0.0.1-alpha model has a dynamic T dimension. The browser
// wrapper has no resize API, so use a fixed 128-frame input and resample.
// Offsets point to the input tensor's two FlatBuffer int32 vectors in the
// verified 40,946,288-byte release model; reject any other model layout.
const FRAMES = 128;
const FEATURES = 390;
const MODEL_BYTES = 40946288;
const SHAPE_OFFSET = 40945460;
const SIGNATURE_OFFSET = 40945408;

function prepareModel(buffer) {
  if (buffer.byteLength !== MODEL_BYTES) throw new Error("Unexpected Kaggle model size");
  const view = new DataView(buffer);
  if (view.getInt32(SHAPE_OFFSET, true) !== 1 || view.getInt32(SHAPE_OFFSET + 4, true) !== FEATURES ||
      view.getInt32(SIGNATURE_OFFSET, true) !== -1 || view.getInt32(SIGNATURE_OFFSET + 4, true) !== FEATURES) {
    throw new Error("Unexpected Kaggle model input layout");
  }
  view.setInt32(SHAPE_OFFSET, FRAMES, true);
  view.setInt32(SIGNATURE_OFFSET, FRAMES, true);
  return buffer;
}

function fitFrames(rows) {
  if (rows.length < 8) throw new Error("Too few frames for sequence recognition");
  const output = new Float32Array(FRAMES * FEATURES);
  for (let t = 0; t < FRAMES; t++) {
    const position = t * (rows.length - 1) / (FRAMES - 1);
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
  const model = await tflite.loadTFLiteModel(prepareModel(bytes), { numThreads: 1 });
  const runner = model.modelRunner;
  if (!runner || runner.getInputs()[0]?.data().length !== FRAMES * FEATURES) throw new Error("TFLite input unavailable");
  return {
    columns: schema.selected_columns,
    transcribe(rows) {
      runner.getInputs()[0].data().set(fitFrames(rows));
      if (!runner.infer()) throw new Error("TFLite inference failed");
      const output = runner.getOutputs()[0];
      return decodeFingerspelling(output.data(), output.shape, characterMap);
    }
  };
}
