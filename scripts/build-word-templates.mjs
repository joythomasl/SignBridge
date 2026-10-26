import { chromium } from "playwright-core";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity, landmarksToVector } from "../src/recognizer.js";

const root = process.cwd();
const extensionPath = path.join(root, "dist");
const profilePath = path.join(root, ".chrome-word-template-profile");
const manifestPath = path.join(root, "assets", "signs", "library.json");
const outputPath = path.join(root, "assets", "signs", "word-templates.json");
const TARGET_FRAMES = 12;

if (!profilePath.startsWith(root + path.sep)) throw new Error("Unsafe temporary profile path");
await rm(profilePath, { recursive: true, force: true });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

function resample(sequence, count) {
  if (sequence.length <= count) return sequence;
  return Array.from({ length: count }, (_, index) => sequence[Math.round(index * (sequence.length - 1) / (count - 1))]);
}

function motionEnergy(sequence) {
  if (sequence.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < sequence.length; index += 1) total += 1 - cosineSimilarity(sequence[index - 1], sequence[index]);
  return total / (sequence.length - 1);
}

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--no-default-browser-check"]
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/vision.html`);
  await page.waitForFunction(() => globalThis.__signbridgeVisionReady === true, null, { timeout: 30000 });

  const templates = {};
  let timestamp = 1000;
  for (const clip of manifest.clips) {
    const results = await page.evaluate(async ({ frameUrls, startTimestamp }) => {
      const output = [];
      let currentTimestamp = startTimestamp;
      for (const frameUrl of frameUrls) {
        currentTimestamp += 100;
        globalThis.__signbridgeLastVisionResult = null;
        const response = await fetch(chrome.runtime.getURL(frameUrl));
        const bitmap = await createImageBitmap(await response.blob());
        window.postMessage({ type: "SIGNBRIDGE_VISION_FRAME", timestamp: currentTimestamp, bitmap }, "*", [bitmap]);
        const startedAt = performance.now();
        while (performance.now() - startedAt < 10000) {
          const result = globalThis.__signbridgeLastVisionResult;
          if (result?.timestamp === currentTimestamp) {
            output.push(result);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      return output;
    }, { frameUrls: clip.frames, startTimestamp: timestamp });
    timestamp += clip.frames.length * 100 + 100;

    const vectors = results.filter((result) => result.landmarks?.length).map(landmarksToVector);
    if (vectors.length < 8) {
      console.warn(`${clip.label}: insufficient hand frames (${vectors.length}/${clip.frames.length})`);
      continue;
    }
    const sequence = resample(vectors, TARGET_FRAMES);
    templates[clip.label.toUpperCase()] = {
      sequence,
      motion: motionEnergy(sequence),
      coverage: vectors.length / clip.frames.length,
      source: "bundled-word-sequence-dataset"
    };
    console.log(`${clip.label}: ${vectors.length}/${clip.frames.length} usable frames`);
  }

  await writeFile(outputPath, `${JSON.stringify({ version: 1, framesPerTemplate: TARGET_FRAMES, templates }, null, 2)}\n`, "utf8");
  console.log(`Created ${Object.keys(templates).length} temporal templates at ${outputPath}`);
} finally {
  await context.close();
}
