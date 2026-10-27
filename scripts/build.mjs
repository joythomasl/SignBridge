import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  await Promise.all([
    mkdir(path.join(dist, "assets", "asl"), { recursive: true }),
    mkdir(path.join(dist, "models"), { recursive: true }),
    mkdir(path.join(dist, "vendor", "mediapipe"), { recursive: true })
  ]);
  await Promise.all([
    cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json")),
    cp(path.join(root, "src", "hud.css"), path.join(dist, "hud.css")),
    cp(path.join(root, "src", "vision.html"), path.join(dist, "vision.html")),
    cp(path.join(root, "assets", "asl", "alphabet-model.json"), path.join(dist, "assets", "asl", "alphabet-model.json")),
    cp(path.join(root, "assets", "asl", "ASL-SignBridge-LICENSE.txt"), path.join(dist, "assets", "asl", "ASL-SignBridge-LICENSE.txt")),
    cp(path.join(root, "assets", "asl", "fingerspelling-model.tflite"), path.join(dist, "assets", "asl", "fingerspelling-model.tflite")),
    cp(path.join(root, "assets", "asl", "inference_args.json"), path.join(dist, "assets", "asl", "inference_args.json")),
    cp(path.join(root, "assets", "asl", "character_to_prediction_index.json"), path.join(dist, "assets", "asl", "character_to_prediction_index.json")),
    cp(path.join(root, "assets", "asl", "Kaggle-ASL-LICENSE.txt"), path.join(dist, "assets", "asl", "Kaggle-ASL-LICENSE.txt")),
    cp(path.join(root, "vendor", "holistic_landmarker.task"), path.join(dist, "models", "holistic_landmarker.task")),
    cp(path.join(root, "node_modules", "@tensorflow", "tfjs-tflite", "wasm"), path.join(dist, "vendor", "tflite"), { recursive: true }),
    cp(
      path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
      path.join(dist, "vendor", "mediapipe"),
      { recursive: true }
    )
  ]);
}

async function makeBuildOptions() {
  return {
    plugins: [{
      name: "extension-tflite-url",
      setup(builder) {
        builder.onLoad({ filter: /tf-tflite\.fesm\.js$/ }, async ({ path: source }) => {
          const original = await readFile(source, "utf8");
          const needle = 'd.startsWith("http")';
          if (!original.includes(needle)) throw new Error("TFLite loader URL patch no longer applies");
          return { contents: original.replace(needle, '/^(https?|chrome-extension):/.test(d)'), loader: "js" };
        });
      }
    }],
    entryPoints: {
      content: path.join(root, "src", "content.js"),
      background: path.join(root, "src", "background.js"),
      "vision-frame": path.join(root, "src", "vision-frame.js")
    },
    bundle: true,
    outdir: dist,
    format: "iife",
    target: "chrome120",
    sourcemap: false,
    logLevel: "info"
  };
}

if (!existsSync(path.join(root, "vendor", "holistic_landmarker.task"))) {
  throw new Error("Missing vendor/holistic_landmarker.task.");
}

if (!watch) {
  await rm(dist, { recursive: true, force: true });
  await copyStatic();
  await build(await makeBuildOptions());
} else {
  await copyStatic();
  const buildContext = await context(await makeBuildOptions());
  await buildContext.watch();
  console.log("Watching SignBridge source files...");
}
