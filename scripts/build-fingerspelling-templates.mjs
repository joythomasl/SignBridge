import { chromium } from "playwright-core";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { landmarksToVector } from "../src/recognizer.js";

const root = process.cwd();
const extensionPath = path.join(root, "dist");
const profilePath = path.join(root, ".chrome-template-profile");
const manifestPath = path.join(root, "assets", "signs", "fingerspelling.json");
const outputPath = path.join(root, "assets", "signs", "fingerspelling-templates.json");

if (!profilePath.startsWith(root + path.sep)) throw new Error("Unsafe temporary profile path");
await rm(profilePath, { recursive: true, force: true });

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check"
  ]
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
  for (const sign of manifest.signs) {
    timestamp += 100;
    const result = await page.evaluate(async ({ frameUrl, frameTimestamp }) => {
      globalThis.__signbridgeLastVisionResult = null;
      const response = await fetch(chrome.runtime.getURL(frameUrl));
      const bitmap = await createImageBitmap(await response.blob());
      window.postMessage({ type: "SIGNBRIDGE_VISION_FRAME", timestamp: frameTimestamp, bitmap }, "*", [bitmap]);
      const startedAt = performance.now();
      while (performance.now() - startedAt < 10000) {
        const current = globalThis.__signbridgeLastVisionResult;
        if (current?.timestamp === frameTimestamp) return current;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Timed out processing ${frameUrl}`);
    }, { frameUrl: sign.frame, frameTimestamp: timestamp });

    if (!result.landmarks?.length) {
      console.warn(`${sign.label}: no hand detected`);
      continue;
    }
    templates[sign.label] = {
      vector: landmarksToVector(result),
      source: "bundled-fingerspelling-dataset"
    };
    console.log(`${sign.label}: template created`);
  }

  await writeFile(outputPath, `${JSON.stringify({ version: 1, templates }, null, 2)}\n`, "utf8");
  console.log(`Created ${Object.keys(templates).length} templates at ${outputPath}`);
} finally {
  await context.close();
}
