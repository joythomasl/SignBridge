import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

async function createLandmarker(delegate) {
  const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("vendor/mediapipe"));
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/hand_landmarker.task"),
      delegate
    },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45
  });
}

function serializableResult(result) {
  return {
    landmarks: (result.landmarks || []).map((hand) => hand.map(({ x, y, z, visibility }) => ({ x, y, z, visibility }))),
    handedness: (result.handedness || []).map((categories) => categories.map(({ categoryName, score }) => ({ categoryName, score })))
  };
}

async function initialize() {
  let landmarker;
  try {
    landmarker = await createLandmarker("GPU");
  } catch {
    landmarker = await createLandmarker("CPU");
  }

  globalThis.__signbridgeExtractImage = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      return serializableResult(landmarker.detect(bitmap));
    } finally {
      bitmap.close();
    }
  };
  globalThis.__signbridgeExtractorReady = true;
}

initialize().catch((error) => {
  globalThis.__signbridgeExtractorError = error?.message || String(error);
});
