import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  await Promise.all([
    cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json")),
    cp(path.join(root, "src", "hud.css"), path.join(dist, "hud.css")),
    cp(path.join(root, "src", "vision.html"), path.join(dist, "vision.html")),
    cp(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true }),
    cp(path.join(root, "vendor", "holistic_landmarker.task"), path.join(dist, "models", "holistic_landmarker.task")),
    cp(path.join(root, "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.wasm"), path.join(dist, "vendor", "ort", "ort-wasm-simd-threaded.wasm")),
    cp(path.join(root, "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.mjs"), path.join(dist, "vendor", "ort", "ort-wasm-simd-threaded.mjs")),
    cp(
      path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"),
      path.join(dist, "vendor", "mediapipe"),
      { recursive: true }
    )
  ]);
  await rm(path.join(dist, "assets", "signs"), { recursive: true, force: true });
}

async function makeBuildOptions() {
  return {
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
