import { VisionController } from "./vision.js";
import { SignBridgeHud } from "./hud.js";
import { MeetAdapter } from "./meet-adapter.js";
import { checkGemma, renderSpelling } from "./gemma.js";
import { getSettings, saveSettings } from "./storage.js";

if (!document.getElementById("signbridge-root")) boot().catch((error) => console.error("SignBridge failed to start", error));

async function boot() {
  let settings = await getSettings();
  let letters = [];
  let handsPresent = false;
  let liveTimer = null;
  let liveGenerating = false;
  let lastSpokenText = "";
  let lastSpokenAt = 0;
  let manualEdited = false;
  const pendingTranscripts = [];

  const hud = new SignBridgeHud({
    startCamera, stopCamera, addLetter, addSpace, backspace, clearLetters, copy, insertChat,
    saveSettings: handleSaveSettings, checkGemma: handleCheckGemma,
    questionChanged: (question) => { if (question) hud.showLatestCaption(question); }
  }, [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  hud.setSettings(settings);
  hud.renderSpelling(letters);

  const vision = new VisionController({
    video: hud.video, canvas: hud.canvas, fps: 30,
    onVector(vector) {
      if (vector) {
        handsPresent = true;
        cancelLiveTimer();
        if (letters.length) hud.setLiveState("Fingerspelling continues — lower your hand to speak", true);
        hud.setDetected({ handPresent: true });
      } else {
        if (handsPresent) {
          handsPresent = false;
          hud.setLiveState("Hand lowered — decoding the complete sign sequence", true);
        }
        hud.setDetected(null);
      }
    },
    onTranscript(match) {
      const text = String(match.text || "").toUpperCase().trim();
      const confidence = Number.isFinite(match.score) ? `${Math.round(match.score * 100)}%` : "unknown";
      const frameDetails = `${match.frames || 0} frames; coordinates H/F/P ${match.coverage?.hand ?? "?"}/${match.coverage?.face ?? "?"}/${match.coverage?.pose ?? "?"}%`;
      if (manualEdited) {
        hud.setStatus("Model result ignored because you are editing letters manually.", "warn");
        return;
      }
      if (match.frames < 15) {
        hud.setStatus(`Sequence too short (${frameDetails}); hold the spelling longer.`, "warn");
        return;
      }
      if (isKaggleDummy(text)) {
        hud.setStatus(`Model rejected this ${match.frames}-frame segment (${confidence}). Keep spelling the whole word continuously, then lower your hand.`, "warn");
        return;
      }
      if (!/^[A-Z ]{1,80}$/.test(text)) {
        hud.setStatus(`Model output was not A–Z text: “${text.slice(0, 24) || "(empty)"}” (${confidence}; ${frameDetails}).`, "warn");
        return;
      }
      if (!Number.isFinite(match.score) || match.score < 0.65) {
        hud.setStatus(`Model guess “${text}” was withheld (${confidence}; ${frameDetails}).`, "warn");
        return;
      }
      if (liveGenerating) { pendingTranscripts.push(text); return; }
      letters = [...text];
      hud.renderSpelling(letters);
      hud.setStatus(`Fingerspelling detected: ${text} (${Math.round(match.score * 100)}%). Speaking automatically.`, "success");
      void flushLivePhrase(true);
    },
    onShortSequence({ frames, minimum }) {
      hud.setStatus(`Only ${frames} tracked frames; this model needs at least ${minimum}. Spell the whole word before lowering your hand.`, "warn");
    },
    onModelStatus(ready, message) {
      hud.setStatus(ready ? "First-place ASL sequence model ready." : `Sequence model unavailable (${message}); manual A–Z entry remains available.`, ready ? "success" : "warn");
    },
    onError(error) { hud.setStatus(`Vision error: ${error.message}`, "error"); }
  });

  const meet = new MeetAdapter({
    onCaption(caption) {
      if (isRecentSpokenCaption(caption)) return;
      hud.showLatestCaption(caption);
      if (looksLikeQuestion(caption)) hud.setQuestion(caption, "caption");
    }
  });
  meet.start();
  hud.setLiveState("Always-live mode starting camera…", true);
  hud.setStatus("Starting ASL camera and Meet captions…", "info");
  startCamera();

  async function startCamera() {
    try {
      hud.setStatus("Loading local hand tracker and Kaggle sequence model…", "info");
      await vision.start();
      hud.setCameraRunning(true);
      hud.setStatus(vision.modelInfo.kaggleReady
        ? "Camera and first-place sequence model ready."
        : "Camera ready. First-place sequence model is loading.", "success");
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
    scheduleLiveGeneration(1200);
  }
  function addSpace() { if (letters.length && letters.at(-1) !== " ") letters.push(" "); manualEdited = true; hud.renderSpelling(letters); scheduleLiveGeneration(1200); }
  function backspace() { letters.pop(); manualEdited = true; hud.renderSpelling(letters); scheduleLiveGeneration(1200); }
  function clearLetters() { cancelLiveTimer(); letters = []; manualEdited = false; hud.renderSpelling(letters); hud.setStatus("Current spelling cleared.", "info"); }

  function scheduleLiveGeneration(delayMs = 450) {
    if (!letters.some((character) => character !== " ") || handsPresent || liveGenerating) return;
    cancelLiveTimer();
    hud.setLiveState("Hand lowered — preparing the spelled text", true);
    liveTimer = setTimeout(flushLivePhrase, delayMs);
  }

  async function flushLivePhrase(ignoreHands = false) {
    liveTimer = null;
    if (liveGenerating) return;
    if (handsPresent && !ignoreHands) return;
    const snapshot = [...letters];
    const literal = snapshot.join("").trim().replace(/\s+/g, " ");
    if (!literal) return;
    liveGenerating = true;
    hud.setAnswer(literal);
    hud.setLiveState("Speaking the detected spelling…", true);
    const speech = speakText(literal);
    const delivery = meet.sendChatMessage(`🤟 Candidate via SignBridge: ${literal}`);
    void renderSpelling(settings, literal).then((response) => {
      const rendered = String(response.result?.answer || "").trim();
      if (hud.getAnswer() === literal && sameLetters(rendered, literal)) hud.setAnswer(rendered);
      hud.setMetrics(response.metrics);
    }).catch(() => {});
    const [spoken, delivered] = await Promise.allSettled([speech, delivery]);
    if (snapshot.every((character, index) => letters[index] === character)) letters.splice(0, snapshot.length);
    manualEdited = letters.length > 0;
    hud.renderSpelling(letters);
    hud.setLiveState("Ready for the next spelling", true);
    const speechOk = spoken.status === "fulfilled";
    const chatOk = delivered.status === "fulfilled";
    hud.setStatus(speechOk
      ? (chatOk ? "Spoken automatically and sent in Meet chat." : `Spoken automatically. Meet chat: ${delivered.reason?.message || "unavailable"}`)
      : `Audio failed: ${spoken.reason?.message || "speech unavailable"}. ${chatOk ? "Text sent in Meet chat." : "Meet chat also unavailable."}`,
    speechOk && chatOk ? "success" : "warn");
    liveGenerating = false;
    if (pendingTranscripts.length && !manualEdited) {
      letters = [...pendingTranscripts.shift()];
      hud.renderSpelling(letters);
      void flushLivePhrase(true);
    } else if (letters.length && !handsPresent) scheduleLiveGeneration();
  }

  function cancelLiveTimer() { if (liveTimer) clearTimeout(liveTimer); liveTimer = null; }
  async function speakText(text) {
    lastSpokenText = text; lastSpokenAt = Date.now();
    try {
      await new Promise((resolve, reject) => chrome.runtime.sendMessage({
        type: "SIGNBRIDGE_SPEAK", text, rate: settings.speechRate
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) reject(new Error(error?.message || response?.error || "Chrome TTS failed"));
        else resolve();
      }));
    } catch (error) {
      if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) throw error;
      await new Promise((resolve, reject) => {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const timeout = setTimeout(() => reject(error), 3000);
        utterance.lang = "en-US"; utterance.rate = settings.speechRate;
        utterance.onstart = () => { clearTimeout(timeout); resolve(); };
        utterance.onerror = (event) => { clearTimeout(timeout); reject(new Error(event.error || error.message)); };
        speechSynthesis.speak(utterance);
      });
    }
  }
  function isRecentSpokenCaption(caption) {
    if (!lastSpokenText || Date.now() - lastSpokenAt > 15000) return false;
    const observed = normalizePhrase(caption), spoken = normalizePhrase(lastSpokenText);
    return observed.length > 10 && (observed.includes(spoken) || spoken.includes(observed));
  }
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
function isKaggleDummy(value) { return normalizePhrase(value) === "2 a e aroe"; }
function sameLetters(a, b) { return normalizePhrase(a) === normalizePhrase(b); }
function looksLikeQuestion(value) { return /\b(what|why|how|when|where|who|which|can|could|would|will|do|does|did|have|has|tell|describe|explain|please|walk)\b/.test(normalizePhrase(value)); }
