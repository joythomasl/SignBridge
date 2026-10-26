import { createServer } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { chromium } from "playwright-core";
import { landmarksToVector } from "../src/recognizer.js";

const root = process.cwd();
const extensionPath = path.join(root, "dist");
const profilePath = path.join(root, ".chrome-alphabet-training-profile");
const outputPath = path.join(root, "artifacts", "alphabet-features.json");
const zipPath = path.resolve(process.argv[2] || "C:/Users/Joy Thomas/Downloads/archive (2).zip");
const perClass = Number(process.argv[3] || 120);
const wantedLabels = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."123456789"];

if (!profilePath.startsWith(root + path.sep)) throw new Error("Unsafe temporary profile path");
await rm(profilePath, { recursive: true, force: true });
await mkdir(path.dirname(outputPath), { recursive: true });

const zip = new AdmZip(zipPath);
const grouped = new Map(wantedLabels.map((label) => [label, []]));
for (const entry of zip.getEntries()) {
  const match = entry.entryName.match(/^Indian\/([^/]+)\/[^/]+\.(?:jpg|jpeg|png)$/i);
  const label = match?.[1]?.toUpperCase();
  if (grouped.has(label)) grouped.get(label).push(entry);
}
for (const entries of grouped.values()) entries.sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

const selected = new Map();
for (const [label, entries] of grouped) {
  if (!entries.length) throw new Error(`No dataset images found for ${label}`);
  const count = Math.min(perClass, entries.length);
  selected.set(label, Array.from({ length: count }, (_, index) => entries[Math.floor(index * entries.length / count)]));
}
const entryByName = new Map([...selected.values()].flat().map((entry) => [entry.entryName, entry]));

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const entry = entryByName.get(url.searchParams.get("name"));
  if (!entry) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(entry.getData());
});
await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
const port = server.address().port;

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
  await page.goto(`chrome-extension://${extensionId}/extractor.html`);
  await page.waitForFunction(() => globalThis.__signbridgeExtractorReady || globalThis.__signbridgeExtractorError, null, { timeout: 30000 });
  const extractorError = await page.evaluate(() => globalThis.__signbridgeExtractorError);
  if (extractorError) throw new Error(extractorError);

  const samples = [];
  const stats = {};
  for (const [label, entries] of selected) {
    let detected = 0;
    for (const entry of entries) {
      const imageUrl = `http://127.0.0.1:${port}/image?name=${encodeURIComponent(entry.entryName)}`;
      const result = await page.evaluate((url) => globalThis.__signbridgeExtractImage(url), imageUrl);
      if (result.landmarks?.length) {
        samples.push({ label, vector: landmarksToVector(result), source: entry.entryName });
        detected += 1;
      }
    }
    stats[label] = { requested: entries.length, detected };
    console.log(`${label}: ${detected}/${entries.length} hands detected`);
  }

  const payload = {
    version: 2,
    featureCount: samples[0]?.vector.length || 0,
    dataset: path.basename(zipPath),
    perClass,
    samples,
    stats
  };
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Saved ${samples.length} landmark samples to ${outputPath}`);
} finally {
  await context.close();
  await new Promise((resolve) => server.close(resolve));
}
