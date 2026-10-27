import { build } from "esbuild";
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const modelBytes = await readFile(path.join(root, "assets/asl/fingerspelling-model.tflite"));
const digest = createHash("sha256").update(modelBytes).digest("hex");
if (digest !== "4dda856e82c4f909c3ae7eb7f070e5fc88afb143daab639683209b631e3cbfaa") throw new Error("Winner model SHA-256 mismatch");
const modelView = new DataView(modelBytes.buffer, modelBytes.byteOffset, modelBytes.byteLength);
if (modelView.getInt32(40945460, true) !== 1 || modelView.getInt32(40945408, true) !== -1) throw new Error("Unexpected TFLite input shape");
modelView.setInt32(40945460, 128, true);
modelView.setInt32(40945408, 128, true);
const bundle = await build({
  stdin: { contents: `import '@tensorflow/tfjs-backend-cpu';
    import * as tflite from '@tensorflow/tfjs-tflite/dist/tf-tflite.fesm.js';
    (async()=>{try{tflite.setWasmPath('/wasm/');const model=await tflite.loadTFLiteModel('/model',{numThreads:1});
    const runner=model.modelRunner;runner.getInputs()[0].data().set(new Float32Array(128*390).fill(Number.NaN));
    const success=runner.infer();const outputs=runner.getOutputs();
    window.probe={ok:true,success,input:runner.getInputs().map(x=>({shape:x.shape,length:x.data().length})),
      output:outputs.map(x=>({shape:x.shape,length:x.data().length,values:Array.from(x.data()).slice(0,10)}))};}
    catch(error){window.probe={ok:false,error:String(error),stack:error?.stack};}})();`,
    resolveDir: root, sourcefile: "probe.js", loader: "js" },
  bundle: true, format: "iife", write: false, target: "chrome120", logLevel: "silent"
});
const server = createServer(async (request, response) => {
  try {
    const route = new URL(request.url, "http://localhost").pathname;
    let body, type;
    if (route === "/") { body = '<!doctype html><script src="/probe.js"></script>'; type = "text/html"; }
    else if (route === "/probe.js") { body = bundle.outputFiles[0].contents; type = "text/javascript"; }
    else if (route === "/model") { body = modelBytes; type = "application/octet-stream"; }
    else if (route.startsWith("/wasm/")) {
      body = await readFile(path.join(root, "node_modules/@tensorflow/tfjs-tflite/wasm", path.basename(route)));
      type = route.endsWith(".wasm") ? "application/wasm" : "text/javascript";
    } else { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": type }); response.end(body);
  } catch (error) { response.writeHead(500).end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: chromium.executablePath(), headless: true });
try {
  const page = await browser.newPage();
  page.on("console", (message) => console.log("console", message.text()));
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => Boolean(window.probe), null, { timeout: 90000 });
  const probe = await page.evaluate(() => window.probe);
  if (!probe.ok || !probe.success || probe.output?.[0]?.length < 63) throw new Error(probe.error || "TFLite inference failed");
  console.log(JSON.stringify({ modelSha256: digest, input: probe.input[0], outputShape: probe.output[0].shape }, null, 2));
} finally { await browser.close(); server.close(); }
