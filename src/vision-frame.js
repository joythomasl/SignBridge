import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";
import { LetterDecoder } from "./asl/letter-decoder.js";
import { loadKaggleModel } from "./asl/kaggle-model.js";
import { kaggleFrame } from "./asl/kaggle-io.js";

let landmarker;
let decoder;
let kaggle;
let lastPreview = "";
let rows = [];
let lastHandAt = 0;
let pendingGap = [];
let inferenceQueue = Promise.resolve();

function reply(message) { window.parent.postMessage(message, "*"); }
const baseUrl = new URL(".", document.currentScript.src).href;
function url(path) { return new URL(path, baseUrl).href; }
function points(list) { return (list || []).map(({ x, y, z }) => ({ x, y, z })); }

async function initialize() {
  try {
    const alphabet = await fetch(url("assets/asl/alphabet-model.json")).then((response) => response.json());
    decoder = new LetterDecoder(alphabet);
    const fileset = await FilesetResolver.forVisionTasks(url("vendor/mediapipe"));
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: url("models/holistic_landmarker.task"), delegate },
      runningMode: "VIDEO"
    });
    try { landmarker = await HolisticLandmarker.createFromOptions(fileset, options("GPU")); }
    catch { landmarker = await HolisticLandmarker.createFromOptions(fileset, options("CPU")); }
    reply({ type: "SIGNBRIDGE_VISION_READY", letters: 26 });
    loadKaggleModel(url).then((model) => {
      kaggle = model;
      globalThis.__signbridgeKaggleStatus = "ready";
      reply({ type: "SIGNBRIDGE_KAGGLE_READY" });
    }).catch((error) => {
      globalThis.__signbridgeKaggleStatus = error?.message || String(error);
      reply({ type: "SIGNBRIDGE_KAGGLE_ERROR", message: error?.message || String(error) });
    });
  } catch (error) { reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) }); }
}

function transcribe() {
  if (!kaggle || rows.length < 12) { rows = []; return; }
  const sequence = rows;
  rows = [];
  inferenceQueue = inferenceQueue.then(async () => {
    const result = await kaggle.transcribe(sequence);
    reply({ type: "SIGNBRIDGE_TRANSCRIPT", ...result, frames: sequence.length });
  }).catch((error) => reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) }));
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "SIGNBRIDGE_VISION_RESET") {
    decoder?.reset(); lastPreview = ""; rows = []; pendingGap = []; lastHandAt = 0;
    return;
  }
  if (event.data?.type !== "SIGNBRIDGE_VISION_FRAME" || !landmarker) return;
  const { bitmap, timestamp } = event.data;
  try {
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const hands = [];
    if (result.leftHandLandmarks?.[0]) hands.push({ points: points(result.leftHandLandmarks[0]), side: "right" });
    if (result.rightHandLandmarks?.[0]) hands.push({ points: points(result.rightHandLandmarks[0]), side: "left" });
    const decoded = decoder.push(hands[0] || null, timestamp);
    for (const letter of decoded.accepted) reply({ type: "SIGNBRIDGE_LETTER_RESULT", ...letter });
    if (decoded.preview !== lastPreview) {
      lastPreview = decoded.preview;
      reply({ type: "SIGNBRIDGE_LETTER_PREVIEW", gloss: decoded.preview });
    }
    if (kaggle) {
      if (hands.length) {
        if (rows.length) rows.push(...pendingGap);
        pendingGap = [];
        lastHandAt = timestamp;
        rows.push(kaggleFrame(result, kaggle.columns));
      } else if (rows.length && timestamp - lastHandAt < 700) {
        pendingGap.push(kaggleFrame(result, kaggle.columns));
      }
      if (rows.length > 600) rows.shift();
    }
    reply({
      type: "SIGNBRIDGE_VISION_RESULT", timestamp, status: hands.length ? "tracked" : "no_hand",
      landmarks: hands.map((hand) => hand.points),
      handedness: hands.map((hand) => [{ categoryName: hand.side, score: 1 }])
    });
    if (!hands.length && rows.length && timestamp - lastHandAt >= 700) {
      pendingGap = [];
      transcribe();
    }
  } catch (error) { reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) }); }
  finally { bitmap?.close?.(); }
});

initialize();
