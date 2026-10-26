import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let landmarker = null;

function reply(message) {
  window.parent.postMessage(message, "*");
}

async function createLandmarker(delegate) {
  const wasmRoot = chrome.runtime.getURL("vendor/mediapipe");
  const modelPath = chrome.runtime.getURL("models/hand_landmarker.task");
  const vision = await FilesetResolver.forVisionTasks(wasmRoot);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5
  });
}

async function initialize() {
  try {
    try {
      landmarker = await createLandmarker("GPU");
    } catch {
      landmarker = await createLandmarker("CPU");
    }
    reply({ type: "SIGNBRIDGE_VISION_READY" });
  } catch (error) {
    reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) });
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "SIGNBRIDGE_VISION_FRAME") return;
  const { bitmap, timestamp } = event.data;
  try {
    const result = landmarker.detectForVideo(bitmap, timestamp);
    const landmarks = (result.landmarks || []).map((hand) => hand.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })));
    reply({ type: "SIGNBRIDGE_VISION_RESULT", landmarks });
  } catch (error) {
    reply({ type: "SIGNBRIDGE_VISION_ERROR", message: error?.message || String(error) });
  } finally {
    bitmap?.close?.();
  }
});

initialize();
