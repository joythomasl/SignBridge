import AdmZip from "adm-zip";
import sharp from "sharp";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.resolve(process.argv[2] || "");
const outputRoot = path.resolve(root, "assets", "signs", "fingerspelling");
const manifestPath = path.resolve(root, "assets", "signs", "fingerspelling.json");

if (!process.argv[2]) throw new Error("Usage: node scripts/import-fingerspelling-dataset.mjs <dataset.zip>");
if (!outputRoot.startsWith(path.resolve(root, "assets", "signs") + path.sep)) throw new Error("Refusing to write outside assets/signs");

const archive = new AdmZip(inputPath);
const groups = new Map();
for (const entry of archive.getEntries()) {
  if (entry.isDirectory || !/\.(png|jpe?g)$/i.test(entry.entryName)) continue;
  const parts = entry.entryName.replaceAll("\\", "/").split("/").filter(Boolean);
  const label = parts.at(-2)?.toUpperCase();
  if (!/^[A-Z1-9]$/.test(label || "")) continue;
  if (!groups.has(label)) groups.set(label, []);
  groups.get(label).push(entry);
}

if (!groups.size) throw new Error("No A-Z or 1-9 labeled images found");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const signs = [];
for (const [label, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const preferred = entries.find((entry) => /\/0\.(png|jpe?g)$/i.test(entry.entryName)) || entries[0];
  const filename = `${label}.webp`;
  await sharp(preferred.getData()).resize(384, 288, { fit: "cover", position: "centre" }).webp({ quality: 70, effort: 4 }).toFile(path.join(outputRoot, filename));
  signs.push({ label, frame: `assets/signs/fingerspelling/${filename}` });
}

await writeFile(manifestPath, `${JSON.stringify({
  version: 1,
  language: "Indian Sign Language fingerspelling dataset",
  source: path.basename(inputPath),
  license: "Unknown — verify before redistribution",
  signs
}, null, 2)}\n`, "utf8");

console.log(`Imported ${signs.length} fingerspelling signs into ${outputRoot}`);
