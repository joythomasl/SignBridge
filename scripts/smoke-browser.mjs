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
  headless: true,
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
  page.on("pageerror", (error) => console.error(`PAGE ERROR: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`PAGE CONSOLE: ${message.text()}`);
  });
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
  try {
    await status.filter({ hasText: "Camera ready" }).waitFor({ timeout: 45000 });
  } catch (error) {
    console.error(`Camera status: ${await status.textContent()}`);
    throw error;
  }
  await page.waitForTimeout(1500);
  const visionFrame = page.frames().find((frame) => frame.url().endsWith("/vision.html"));
  if (!visionFrame) throw new Error("Vision sandbox frame is missing");
  await visionFrame.waitForFunction(() => Boolean(globalThis.__signbridgeKaggleStatus), null, { timeout: 20000 });
  const modelState = await visionFrame.evaluate(() => globalThis.__signbridgeKaggleStatus);
  if (modelState !== "ready") throw new Error(`First-place sequence model failed to load: ${modelState}`);
  const cameraStatus = await status.textContent();
  await panel.locator("#sb-stop-camera").click();

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
  await page.waitForFunction(() => {
    const input = document.querySelector("#signbridge-root")?.shadowRoot?.querySelector("#sb-question");
    return Boolean(input?.value);
  }, null, { timeout: 15000 });
  const detectedCaption = await panel.locator("#sb-question").inputValue();
  await panel.locator("#sb-interviewer-caption").filter({ hasText: detectedCaption }).waitFor({ timeout: 15000 });
  if (await panel.locator("#sb-sign-avatar").count()) throw new Error("Interviewer animation should be removed");
  await page.evaluate(() => {
    const body = document.querySelector("#signbridge-root")?.shadowRoot?.querySelector("#sb-body");
    if (body) body.scrollTop = 0;
  });
  await page.screenshot({ path: signArtifactPath, fullPage: true });

  await panel.locator("#sb-question").fill("");
  await page.evaluate(() => {
    const openChat = document.createElement("button");
    openChat.setAttribute("aria-label", "Open in-call messages");
    openChat.style.cssText = "position:fixed;left:10px;top:10px;width:180px;height:40px";
    const panel = document.createElement("div");
    panel.hidden = true;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "In-call messages");
    const chat = document.createElement("div");
    chat.contentEditable = "true";
    chat.setAttribute("role", "textbox");
    chat.setAttribute("aria-label", "Send a message");
    chat.style.cssText = "position:fixed;left:10px;top:60px;width:200px;height:40px";
    const send = document.createElement("button");
    send.setAttribute("aria-label", "Send message");
    send.style.cssText = "position:fixed;left:220px;top:60px;width:80px;height:40px";
    send.addEventListener("click", () => {
      document.body.dataset.signbridgeChatSent = chat.textContent || "sent";
      chat.textContent = "";
    });
    openChat.addEventListener("click", () => { panel.hidden = false; });
    panel.append(chat, send);
    document.body.append(openChat, panel);
  });

  await panel.locator("details").filter({ hasText: "Recognition and manual correction" }).locator("summary").click();
  const glossSelect = panel.locator("#sb-calibration-gloss");
  const addGloss = panel.locator("#sb-add-gloss");
  for (const gloss of [..."HELLO"]) {
    await glossSelect.selectOption(gloss);
    await addGloss.click();
  }
  const answer = panel.locator("#sb-answer");
  try {
    await page.waitForFunction(() => {
      const host = document.querySelector("#signbridge-root");
      return Boolean(host?.shadowRoot?.querySelector("#sb-answer")?.value);
    }, null, { timeout: 45000 });
  } catch (error) {
    console.error("Answer status:", await status.textContent());
    throw error;
  }
  try {
    await page.waitForFunction(() => Boolean(document.body.dataset.signbridgeChatSent), null, { timeout: 5000 });
  } catch (error) {
    console.error("Chat status:", await status.textContent());
    console.error("Chat DOM:", await page.evaluate(() => ({
      opened: !document.querySelector('[aria-label="In-call messages"]')?.hidden,
      draft: document.querySelector('[aria-label="Send a message"]')?.textContent
    })));
    throw error;
  }

  const answerText = await answer.inputValue();
  const finalStatus = await status.textContent();
  const workerUrl = context.serviceWorkers()[0]?.url() || "";
  const extensionOrigin = workerUrl.match(/^chrome-extension:\/\/[^/]+/)?.[0] || "unknown";
  if (answerText.replace(/[^a-z]/gi, "").toUpperCase() !== "HELLO") throw new Error(`Spelling was altered: ${answerText}`);

  await page.screenshot({ path: artifactPath, fullPage: true });
  console.log(JSON.stringify({
    extensionMounted: true,
    extensionOrigin,
    cameraStatus,
    firstPlaceModel: modelState,
    captionAutoDetected: detectedCaption,
    gemmaStatus: finalStatus,
    reverseCaption: await panel.locator("#sb-interviewer-caption").textContent(),
    answer: answerText,
    meetChatDelivery: await page.evaluate(() => document.body.dataset.signbridgeChatSent),
    signScreenshot: signArtifactPath,
    screenshot: artifactPath
  }, null, 2));
} finally {
  await context.close();
}
