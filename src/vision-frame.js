import { FilesetResolver, HolisticLandmarker } from "@mediapipe/tasks-vision";
import * as ort from "onnxruntime-web/wasm";
import { assembleFrame } from "./asl/assemble.ts";
import { modelInput } from "./asl/features.ts";
import { Segmenter, frameStatus } from "./asl/segmenter.ts";
import { classifyAslLetter, normalizeAslHand } from "./asl/alphabet.js";

let landmarker;
let session;
let labels = [];
let alphabet;
let busy = false;
const segmenter = new Segmenter({ gapMs: 850, minFrames: 8 });
let lastLetter = "";
let letterSince = 0;
let lastAcceptedLetter = "";
let lastAcceptedAt = 0;
let suppressLettersUntilHandsLeave = false;
let frameStatuses = [];
let generation = 0;

function reply(message) { window.parent.postMessage(message, "*"); }
function url(path) { return chrome.runtime.getURL(path); }
function points(list) { return (list || []).map(({ x, y, z }) => ({ x, y, z })); }

async function initialize() {
  try {
    const [labelData, alphabetData] = await Promise.all([
      fetch(url("assets/asl/labels.json")).then((r) => r.json()),
      fetch(url("assets/asl/alphabet-model.json")).then((r) => r.json())
    ]);
    labels = labelData.signs;
    alphabet = alphabetData;
    const fileset = await FilesetResolver.forVisionTasks(url("vendor/mediapipe"));
    try { landmarker = await createHolistic(fileset, "GPU"); }
    catch { landmarker = await createHolistic(fileset, "CPU"); }
    ort.env.wasm.wasmPaths = url("vendor/ort/");
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(url("assets/asl/model.onnx"), {
      executionProviders: ["wasm"], graphOptimizationLevel: "all"
    });
    globalThis.__signbridgeVisionReady = true;
    reply({ type: "SIGNBRIDGE_VISION_READY", words: labels.filter((item) => item.shipped).length, letters: alphabet.labels.length });
  } catch (error) { reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) }); }
}

function createHolistic(fileset, delegate) {
  return HolisticLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: url("models/holistic_landmarker.task"), delegate },
    runningMode: "VIDEO"
  });
}

function softmaxBest(logits) {
  const shipped = labels.filter((item) => item.shipped);
  const max = Math.max(...shipped.map((item) => logits[item.index] / 0.8826538438450513));
  const scores = shipped.map((item) => ({ item, score: Math.exp(logits[item.index] / 0.8826538438450513 - max) }));
  const total = scores.reduce((sum, value) => sum + value.score, 0);
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  return {
    gloss: best?.item.label?.toUpperCase(),
    score: best?.score / total || 0,
    candidates: scores.slice(0, 3).map(({ item, score }) => ({
      gloss: item.label.toUpperCase(), score: score / total
    }))
  };
}

async function inferWord(segment) {
  if (busy || !session) return;
  busy = true;
  const startedGeneration = generation;
  try {
    const input = modelInput(segment.frames, segment.fps, { fps: 30, maxFrames: 64, featureSet: "hands_pose_lips" });
    if (input.frames < 8 || input.dim !== 460) return;
    const result = await session.run({ frames: new ort.Tensor("float32", input.data, [1, input.frames, input.dim]) });
    if (startedGeneration !== generation) return;
    const prediction = softmaxBest(result.logits.data);
    if (prediction.score >= 0.45) {
      lastLetter = "";
      letterSince = 0;
      suppressLettersUntilHandsLeave = true;
      reply({ type: "SIGNBRIDGE_WORD_RESULT", ...prediction });
    } else {
      suppressLettersUntilHandsLeave = true;
      reply({ type: "SIGNBRIDGE_WORD_UNCERTAIN", ...prediction });
    }
  } catch (error) { reply({ type: "SIGNBRIDGE_VISION_ERROR", message: `ASL model: ${error?.message || error}` }); }
  finally { busy = false; }
}

function handleLetter(hand, now, signing) {
  if (!hand) {
    lastLetter = "";
    letterSince = 0;
    lastAcceptedLetter = "";
    suppressLettersUntilHandsLeave = false;
    return;
  }
  if (signing || suppressLettersUntilHandsLeave) { lastLetter = ""; letterSince = 0; return; }
  const candidate = classifyAslLetter(normalizeAslHand(hand), alphabet);
  if (!candidate || candidate.score < 0.78) { lastLetter = ""; letterSince = 0; return; }
  if (candidate.gloss !== lastLetter) { lastLetter = candidate.gloss; letterSince = now; return; }
  if (now - letterSince < 1500 || (lastAcceptedLetter === candidate.gloss && now - lastAcceptedAt < 4000)) return;
  lastAcceptedLetter = candidate.gloss;
  lastAcceptedAt = now;
  letterSince = now;
  suppressLettersUntilHandsLeave = true;
  reply({ type: "SIGNBRIDGE_LETTER_RESULT", ...candidate });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type === "SIGNBRIDGE_VISION_RESET") {
    generation++;
    segmenter.reset();
    frameStatuses = [];
    lastLetter = "";
    letterSince = 0;
    suppressLettersUntilHandsLeave = false;
    return;
  }
  if (event.data?.type !== "SIGNBRIDGE_VISION_FRAME" || !landmarker) return;
  const { bitmap, timestamp } = event.data;
  try {
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const hands = [];
    if (result.leftHandLandmarks?.[0]) hands.push({ points: points(result.leftHandLandmarks[0]), side: "left" });
    if (result.rightHandLandmarks?.[0]) hands.push({ points: points(result.rightHandLandmarks[0]), side: "right" });
    const pose = result.poseLandmarks?.[0];
    const face = result.faceLandmarks?.[0];
    const frame = assembleFrame({ hands, pose: pose ? points(pose) : null, face: face ? points(face) : null });
    const status = frameStatus(frame, result.poseLandmarks?.length || 0);
    const segmentEvent = segmenter.push(frame, timestamp, { crowded: status === "crowded" });
    if (segmenter.state === "signing") frameStatuses.push(status);
    if (segmentEvent?.type === "start") { lastLetter = ""; letterSince = 0; frameStatuses = [status]; }
    if (segmentEvent?.type === "end") {
      const partial = frameStatuses.filter((value) => value === "partial").length;
      const framed = frameStatuses.filter((value) => value === "ok").length + partial;
      if (partial <= framed / 2) inferWord(segmentEvent.segment);
      else reply({ type: "SIGNBRIDGE_WORD_UNCERTAIN", gloss: "", score: 0, reason: "partial" });
      frameStatuses = [];
    }
    if (segmentEvent?.type === "discard") frameStatuses = [];
    handleLetter(hands[0], timestamp, segmenter.state === "signing" || busy);
    reply({
      type: "SIGNBRIDGE_VISION_RESULT", timestamp, status,
      landmarks: hands.map((hand) => hand.points), handedness: hands.map((hand) => [{ categoryName: hand.side === "left" ? "Left" : "Right", score: 1 }])
    });
  } catch (error) { reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) }); }
  finally { bitmap?.close?.(); }
});

initialize();
