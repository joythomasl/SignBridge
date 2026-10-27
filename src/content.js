import { VisionController } from "./vision.js";
import { SignBridgeHud } from "./hud.js";
import { MeetAdapter } from "./meet-adapter.js";
import { checkGemma, renderSpelling, refineMeetCaption } from "./gemma.js";
import { getSettings, saveSettings } from "./storage.js";

if (!document.getElementById("signbridge-root")) boot().catch((error) => console.error("SignBridge failed to start", error));

async function boot() {
  let settings = await getSettings();
  let letters = [];
  let handsPresent = false;
  let liveTimer = null;
  let liveGenerating = false;
  let captionRevision = 0;
  let lastSpokenText = "";
  let lastSpokenAt = 0;
  let manualEdited = false;

  const hud = new SignBridgeHud({
    startCamera, stopCamera, addLetter, addSpace, backspace, clearLetters, speak, copy, insertChat,
    saveSettings: handleSaveSettings, checkGemma: handleCheckGemma,
    questionChanged: (question) => { if (question) hud.showLatestCaption(question); }
  }, [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  hud.setSettings(settings);
  hud.renderSpelling(letters);

  const vision = new VisionController({
    video: hud.video, canvas: hud.canvas, fps: Math.max(settings.inferenceFps, 20),
    onVector(vector) {
      if (vector) {
        handsPresent = true;
        cancelLiveTimer();
        if (letters.length) hud.setLiveState("Fingerspelling continues — lower your hand to speak", true);
        else hud.setDetected({ handPresent: true });
      } else {
        if (handsPresent) { handsPresent = false; scheduleLiveGeneration(); }
        hud.setDetected(null);
      }
    },
    onLetter(match) {
      if (!/^[A-Z]$/.test(match.gloss)) return;
      letters.push(match.gloss);
      hud.renderSpelling(letters);
      hud.setDetected(match);
      hud.setStatus(`Accepted ASL letter ${match.gloss} (${Math.round(match.score * 100)}%).`, "success");
      if (!handsPresent) scheduleLiveGeneration();
    },
    onPreview(match) { if (match.gloss) hud.setPreview(match.gloss); },
    onTranscript(match) {
      const text = String(match.text || "").toUpperCase().trim();
      if (manualEdited || match.score < 0.65 || !/^[A-Z ]{1,80}$/.test(text)) {
        hud.setStatus("Sequence model was uncertain; review the held-letter spelling.", "warn");
        return;
      }
      letters = [...text];
      hud.renderSpelling(letters);
      hud.setStatus(`First-place sequence model: ${text} (${Math.round(match.score * 100)}%). Review or correct before speaking.`, "success");
      scheduleLiveGeneration();
    },
    onModelStatus(ready, message) {
      hud.setStatus(ready ? "First-place ASL sequence model ready. A–Z live preview active." : `Sequence model unavailable (${message}); static-letter fallback active.`, ready ? "success" : "warn");
    },
    onError(error) { hud.setStatus(`Vision error: ${error.message}`, "error"); }
  });

  const meet = new MeetAdapter({
    async onCaption(caption) {
      if (isRecentSpokenCaption(caption)) return;
      const revision = ++captionRevision;
      hud.showLatestCaption(caption);
      if (looksLikeQuestion(caption)) hud.setQuestion(caption, "caption");
      try {
        const refined = await refineMeetCaption(settings, caption);
        if (revision !== captionRevision) return;
        const cleaned = String(refined.result?.caption || "").trim();
        if (!cleaned || cleaned.length > 320) return;
        hud.showLatestCaption(cleaned);
        if (refined.result?.is_question) hud.setQuestion(cleaned, "caption");
      } catch { /* Keep Meet's caption when Gemma is unavailable. */ }
    }
  });
  meet.start();
  hud.setLiveState("Always-live mode ready — start the camera", true);
  hud.setStatus("ASL fingerspelling and Meet captions are ready.", "success");

  async function startCamera() {
    try {
      hud.setStatus("Loading local hand tracker and ASL alphabet…", "info");
      await vision.start();
      hud.setCameraRunning(true);
      hud.setStatus(vision.modelInfo.kaggleReady
        ? "Camera ready. First-place sequence model and A–Z preview loaded."
        : "Camera ready. A–Z preview loaded; sequence model is loading.", "success");
    } catch (error) {
      hud.setCameraRunning(false);
      hud.setStatus(`Camera unavailable: ${error.message}`, "error");
    }
  }

  function stopCamera() {
    cancelLiveTimer();
    handsPresent = false;
    vision.stop();
    hud.setCameraRunning(false);
    hud.setDetected(null);
    hud.setStatus("Camera stopped.", "info");
  }

  function addLetter() {
    const letter = hud.getCalibrationGloss();
    if (!/^[A-Z]$/.test(letter)) return;
    letters.push(letter);
    manualEdited = true;
    hud.renderSpelling(letters);
    hud.setStatus(`Added ${letter} manually.`, "success");
    scheduleLiveGeneration();
  }
  function addSpace() { if (letters.length && letters.at(-1) !== " ") letters.push(" "); manualEdited = true; hud.renderSpelling(letters); scheduleLiveGeneration(); }
  function backspace() { letters.pop(); manualEdited = true; hud.renderSpelling(letters); scheduleLiveGeneration(); }
  function clearLetters() { cancelLiveTimer(); letters = []; manualEdited = false; hud.renderSpelling(letters); hud.setStatus("Current spelling cleared.", "info"); }

  function scheduleLiveGeneration() {
    if (!letters.some((character) => character !== " ") || handsPresent || liveGenerating) return;
    cancelLiveTimer();
    hud.setLiveState("Hand lowered — preparing the spelled text", true);
    liveTimer = setTimeout(flushLivePhrase, Math.max(settings.livePauseMs || 0, 2000));
  }

  async function flushLivePhrase() {
    liveTimer = null;
    if (handsPresent || liveGenerating) return;
    const snapshot = [...letters];
    const literal = snapshot.join("").trim().replace(/\s+/g, " ");
    if (!literal) return;
    liveGenerating = true;
    let answer = literal;
    hud.setLiveState("Rendering fingerspelled text…", true);
    try {
      const response = await renderSpelling(settings, literal);
      const rendered = String(response.result?.answer || "").trim();
      if (sameLetters(rendered, literal)) answer = rendered;
      hud.setMetrics(response.metrics);
    } catch { hud.setStatus("Gemma 4 unavailable; using literal fingerspelling.", "warn"); }
    hud.setAnswer(answer);
    speakText(answer);
    let delivered = false;
    let deliveryError;
    try { await meet.sendChatMessage(`🤟 Candidate via SignBridge: ${answer}`); delivered = true; }
    catch (error) { deliveryError = error; }
    if (snapshot.every((character, index) => letters[index] === character)) letters.splice(0, snapshot.length);
    manualEdited = false;
    hud.renderSpelling(letters);
    hud.setLiveState("Spoken — ready for the next spelling", true);
    hud.setStatus(delivered ? "Spoken locally and sent in Meet chat." : `Spoken locally. ${deliveryError?.message || "Meet chat delivery unavailable."}`, delivered ? "success" : "warn");
    liveGenerating = false;
    if (letters.length && !handsPresent) scheduleLiveGeneration();
  }

  function cancelLiveTimer() { if (liveTimer) clearTimeout(liveTimer); liveTimer = null; }
  function speakText(text) {
    lastSpokenText = text; lastSpokenAt = Date.now();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN"; utterance.rate = settings.speechRate;
    speechSynthesis.speak(utterance);
  }
  function isRecentSpokenCaption(caption) {
    if (!lastSpokenText || Date.now() - lastSpokenAt > 15000) return false;
    const observed = normalizePhrase(caption), spoken = normalizePhrase(lastSpokenText);
    return observed.length > 10 && (observed.includes(spoken) || spoken.includes(observed));
  }
  function speak() { const answer = hud.getAnswer(); if (answer) speakText(answer); }
  async function copy() { const answer = hud.getAnswer(); if (answer) await navigator.clipboard.writeText(answer); }
  function insertChat() {
    const answer = hud.getAnswer(); if (!answer) return;
    try { meet.insertChatDraft(`🤟 Candidate via SignBridge: ${answer}`); hud.setStatus("Draft inserted in Meet chat.", "success"); }
    catch (error) { hud.setStatus(error.message, "warn"); }
  }
  async function handleSaveSettings() {
    const form = hud.getSettingsForm();
    if (!form.endpoint || !form.model) { hud.setStatus("Endpoint and model are required.", "warn"); return; }
    settings = await saveSettings({ ...settings, ...form });
    hud.setSettings(settings); hud.setStatus("Gemma 4 settings saved.", "success");
  }
  async function handleCheckGemma() {
    await handleSaveSettings();
    try { const health = await checkGemma(settings); hud.setStatus(health.installed ? `Gemma 4 ready: ${settings.model}` : `Model ${settings.model} is not installed.`, health.installed ? "success" : "warn"); }
    catch (error) { hud.setStatus(`Gemma endpoint unavailable: ${error.message}`, "error"); }
  }
}

function normalizePhrase(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(); }
function sameLetters(a, b) { return normalizePhrase(a) === normalizePhrase(b); }
function looksLikeQuestion(value) { return /\b(what|why|how|when|where|who|which|can|could|would|will|do|does|did|have|has|tell|describe|explain|please|walk)\b/.test(normalizePhrase(value)); }
