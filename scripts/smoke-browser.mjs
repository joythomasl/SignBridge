import { chromium } from "playwright-core";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const extensionPath = path.join(root, "dist");
const profilePath = path.join(root, ".chrome-smoke-profile");
const artifactPath = path.join(root, "artifacts", "browser-smoke.png");
const signArtifactPath = path.join(root, "artifacts", "sign-library-smoke.png");

await rm(profilePath, { recursive: true, force: true });
await mkdir(path.dirname(artifactPath), { recursive: true });

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream"
  ]
});

try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://meet.google.com/abc-defg-hij", { waitUntil: "domcontentloaded", timeout: 45000 });
  const rootHost = page.locator("#signbridge-root");
  await rootHost.waitFor({ state: "attached", timeout: 15000 });

  const panel = rootHost;
  const initialWorkerUrl = context.serviceWorkers()[0]?.url() || "";
  const initialOrigin = initialWorkerUrl.match(/^chrome-extension:\/\/[^/]+/)?.[0] || "unknown";
  console.log(`Extension worker: ${initialWorkerUrl || "unknown"}`);
  console.log(`Extension origin: ${initialOrigin}`);
  const status = panel.locator("#sb-status");
  await panel.locator("#sb-start-camera").click();
  await status.filter({ hasText: "Camera ready" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const cameraStatus = await status.textContent();
  await panel.locator("#sb-stop-camera").click();

  await panel.locator("#sb-check-gemma").click();
  await status.filter({ hasText: "Gemma 4 ready" }).waitFor({ timeout: 15000 });

  const reverseQuestion = "How are you?";
  await page.evaluate((caption) => {
    document.querySelectorAll('[aria-live], [role="log"]').forEach((element) => {
      if (!element.closest("#signbridge-root")) {
        element.removeAttribute("aria-live");
        element.removeAttribute("role");
      }
    });
    const liveCaption = document.createElement("div");
    liveCaption.id = "signbridge-smoke-caption";
    liveCaption.setAttribute("aria-live", "polite");
    liveCaption.textContent = caption;
    document.body.appendChild(liveCaption);
  }, reverseQuestion);
  await page.waitForFunction((question) => {
    const input = document.querySelector("#signbridge-root")?.shadowRoot?.querySelector("#sb-question");
    return input?.value === question;
  }, reverseQuestion, { timeout: 5000 });
  const detectedCaption = await panel.locator("#sb-question").inputValue();
  await panel.locator("#sb-sign-caption").filter({ hasText: reverseQuestion }).waitFor({ timeout: 15000 });
  await panel.locator("#sb-sign-quality").filter({ hasText: "Dataset phrase clip" }).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const image = document.querySelector("#signbridge-root")?.shadowRoot?.querySelector("#sb-sign-image");
    return Boolean(image && !image.hidden && image.getAttribute("src"));
  }, null, { timeout: 5000 });
  await page.evaluate(() => {
    const body = document.querySelector("#signbridge-root")?.shadowRoot?.querySelector("#sb-body");
    if (body) body.scrollTop = 0;
  });
  await page.screenshot({ path: signArtifactPath, fullPage: true });

  const question = "Please explain a project you worked on.";
  await panel.locator("#sb-question").fill(question);

  await panel.locator("details").filter({ hasText: "Recognition setup and fallback" }).locator("summary").click();
  const glossSelect = panel.locator("#sb-calibration-gloss");
  const addGloss = panel.locator("#sb-add-gloss");
  for (const gloss of ["ME", "PYTHON", "AI", "PROJECT", "THREE", "YEAR"]) {
    await glossSelect.selectOption(gloss);
    await addGloss.click();
  }
  const answer = panel.locator("#sb-answer");
  await page.waitForFunction(() => {
    const host = document.querySelector("#signbridge-root");
    return Boolean(host?.shadowRoot?.querySelector("#sb-answer")?.value);
  }, null, { timeout: 15000 });

  const answerText = await answer.inputValue();
  const finalStatus = await status.textContent();
  const workerUrl = context.serviceWorkers()[0]?.url() || "";
  const extensionOrigin = workerUrl.match(/^chrome-extension:\/\/[^/]+/)?.[0] || "unknown";
  if (/unavailable|fallback/i.test(finalStatus || "") || /^My response is:/i.test(answerText)) {
    throw new Error(`Extension used fallback instead of Gemma 4. Status: ${finalStatus}`);
  }

  await page.screenshot({ path: artifactPath, fullPage: true });
  console.log(JSON.stringify({
    extensionMounted: true,
    extensionOrigin,
    cameraStatus,
    captionAutoDetected: detectedCaption,
    gemmaStatus: finalStatus,
    reverseCaption: await panel.locator("#sb-sign-caption").textContent(),
    reverseQuality: await panel.locator("#sb-sign-quality").textContent(),
    answer: answerText,
    signScreenshot: signArtifactPath,
    screenshot: artifactPath
  }, null, 2));
} finally {
  await context.close();
}
