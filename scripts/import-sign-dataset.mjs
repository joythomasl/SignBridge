import AdmZip from "adm-zip";
import sharp from "sharp";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.resolve(process.argv[2] || "");
const outputRoot = path.resolve(root, "assets", "signs", "library");
const manifestPath = path.resolve(root, "assets", "signs", "library.json");

if (!process.argv[2]) {
  throw new Error("Usage: node scripts/import-sign-dataset.mjs <dataset.zip>");
}
if (!outputRoot.startsWith(path.resolve(root, "assets", "signs") + path.sep)) {
  throw new Error("Refusing to write outside assets/signs");
}

function openImageArchive(filePath) {
  const outer = new AdmZip(filePath);
  const nested = outer.getEntries().find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".zip"));
  return nested ? new AdmZip(nested.getData()) : outer;
}

function slugify(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function frameNumber(entryName) {
  return Number.parseInt(path.posix.basename(entryName, path.posix.extname(entryName)), 10) || 0;
}

const archive = openImageArchive(inputPath);
const groups = new Map();
for (const entry of archive.getEntries()) {
  if (entry.isDirectory || !/\.(png|jpe?g)$/i.test(entry.entryName)) continue;
  const parts = entry.entryName.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length < 2) continue;
  const label = parts.at(-2).trim().toLowerCase();
  if (!groups.has(label)) groups.set(label, []);
  groups.get(label).push(entry);
}

if (!groups.size) throw new Error("No labeled image sequences were found in the archive");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const clips = [];
for (const [label, unsortedEntries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const slug = slugify(label);
  const clipDirectory = path.join(outputRoot, slug);
  await mkdir(clipDirectory, { recursive: true });
  const entries = unsortedEntries.sort((a, b) => frameNumber(a.entryName) - frameNumber(b.entryName));
  const frames = [];

  for (let index = 0; index < entries.length; index += 1) {
    const filename = `${String(index + 1).padStart(3, "0")}.webp`;
    const destination = path.join(clipDirectory, filename);
    await sharp(entries[index].getData())
      .resize(384, 288, { fit: "cover", position: "centre" })
      .webp({ quality: 64, effort: 4 })
      .toFile(destination);
    frames.push(`assets/signs/library/${slug}/${filename}`);
  }

  clips.push({
    id: slug,
    label,
    kind: label.includes(" ") ? "phrase" : "word",
    fps: 10,
    frames
  });
  console.log(`${label}: ${frames.length} frames`);
}

const manifest = {
  version: 1,
  language: "Indian Sign Language",
  source: path.basename(inputPath),
  license: "Unknown — verify before redistribution",
  generatedAt: new Date().toISOString(),
  clipCount: clips.length,
  clips
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Imported ${clips.length} clips into ${outputRoot}`);
