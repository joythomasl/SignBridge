import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/asl/segmenter.ts", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent"
});
const { Segmenter } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

function frame(hand, offset = 0) {
  const points = new Float32Array(543 * 3).fill(Number.NaN);
  points[(468 + 21 + 11) * 3] = 0.4;
  points[(468 + 21 + 11) * 3 + 1] = 0.5;
  points[(468 + 21 + 12) * 3] = 0.6;
  points[(468 + 21 + 12) * 3 + 1] = 0.5;
  if (hand) for (let i = 0; i < 21; i++) {
    points[(468 + i) * 3] = 0.4 + i * 0.002 + offset;
    points[(468 + i) * 3 + 1] = 0.4;
  }
  return points;
}

test("a hand entering the frame starts and completes a held ASL sign", () => {
  const segmenter = new Segmenter({ gapMs: 850, minFrames: 8 });
  assert.equal(segmenter.push(frame(false), 0), null);
  assert.equal(segmenter.push(frame(true), 50)?.type, "start");
  let ended;
  for (let t = 100; t <= 1100; t += 50) {
    const event = segmenter.push(frame(true), t);
    if (event?.type === "end") ended = event;
  }
  assert.equal(ended?.type, "end");
  assert.equal(ended?.reason, "still");
  assert.ok(ended?.segment.frames.length >= 8);
});

test("a completed sign is not repeated while the hand remains still", () => {
  const segmenter = new Segmenter({ gapMs: 850, minFrames: 8 });
  segmenter.push(frame(true), 0);
  let ends = 0;
  for (let t = 50; t <= 2000; t += 50) {
    if (segmenter.push(frame(true), t)?.type === "end") ends++;
  }
  assert.equal(ends, 1);
});

test("a moving word remains one segment until the hand settles", () => {
  const segmenter = new Segmenter({ gapMs: 850, minFrames: 8 });
  assert.equal(segmenter.push(frame(true), 0)?.type, "start");
  let ended;
  for (let t = 50; t <= 550; t += 50) {
    const event = segmenter.push(frame(true, t * 0.0003), t);
    assert.notEqual(event?.type, "end");
  }
  for (let t = 600; t <= 1700; t += 50) {
    const event = segmenter.push(frame(true, 0.165), t);
    if (event?.type === "end") ended = event;
  }
  assert.equal(ended?.type, "end");
  assert.ok(ended.segment.durationMs >= 500);
});
