import { VisionController } from "./vision.js";
import { SignBridgeHud } from "./hud.js";
import { MeetAdapter } from "./meet-adapter.js";
import { checkGemma, generateAnswer, refineMeetCaption } from "./gemma.js";
import { getSettings, saveSettings } from "./storage.js";

if (!document.getElementById("signbridge-root")) {
  boot().catch((error) => console.error("SignBridge failed to start", error));
}

async function boot() {
  let settings = await getSettings();
  const labelData = await fetch(chrome.runtime.getURL("assets/asl/labels.json")).then((response) => response.json());
  const vocabulary = [...new Set([
    ...labelData.signs.filter((item) => item.shipped).map((item) => item.label.toUpperCase()),
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  ])].sort();
  let glossBuffer = [];
  let latestCaption = "";
  let handsPresent = false;
  let liveTimer = null;
  let liveGenerating = false;
  let captionRevision = 0;
  let lastSpokenText = "";
  let lastSpokenAt = 0;

  const hud = new SignBridgeHud({
    startCamera, stopCamera, addGloss, clearGlosses, speak, copy, insertChat,
    saveSettings: handleSaveSettings, checkGemma: handleCheckGemma,
    questionChanged: (question) => {
      if (question) hud.showLatestCaption(question);
    }
  }, vocabulary);
  hud.setSettings(settings);
  hud.renderGlosses(glossBuffer, removeGloss);

  function accept(match, kind) {
    if (!match?.gloss) return;
    glossBuffer.push(match.gloss);
    hud.renderGlosses(glossBuffer, removeGloss);
    hud.setDetected(match);
    hud.setStatus(`ASL ${kind} accepted: ${match.gloss} (${Math.round(match.score * 100)}%)`, "success");
    if (!handsPresent) scheduleLiveGeneration();
  }

  const vision = new VisionController({
    video: hud.video, canvas: hud.canvas, fps: settings.inferenceFps,
    onVector(vector) {
      if (vector) {
        handsPresent = true;
        cancelLiveTimer();
        if (glossBuffer.length) hud.setLiveState("Signing continues — audio waits until hands are lowered", true);
        else hud.setDetected({ handPresent: true });
      } else {
        if (handsPresent) {
          handsPresent = false;
          scheduleLiveGeneration();
        }
        hud.setDetected(null);
      }
    },
    onWord: (match) => accept(match, "word"),
    onLetter: (match) => accept(match, "letter"),
    onUncertain(match) {
      hud.setStatus(match?.reason === "partial"
        ? "Keep your shoulders and hands in frame, then repeat the word."
        : `ASL sign unclear${match?.gloss ? ` (closest: ${match.gloss})` : ""}. Repeat the complete word.`, "warn");
    },
    onError(error) { hud.setStatus(`Vision error: ${error.message}`, "error"); }
  });

  const meet = new MeetAdapter({
    async onCaption(caption) {
      if (isRecentSpokenCaption(caption)) return;
      const revision = ++captionRevision;
      latestCaption = caption;
      hud.showLatestCaption(caption);
      if (looksLikeQuestion(caption)) hud.setQuestion(caption, "caption");
      try {
        const refined = await refineMeetCaption(settings, caption);
        if (revision !== captionRevision) return;
        const cleaned = String(refined.result?.caption || "").trim();
        if (!cleaned || cleaned.length > 320) return;
        latestCaption = cleaned;
        hud.showLatestCaption(cleaned);
        if (refined.result?.is_question) hud.setQuestion(cleaned, "caption");
      } catch {
        // Keep Meet's caption if the local language model is unavailable.
      }
    }
  });
  meet.start();
  hud.setLiveState("Always-live mode ready — start the camera to begin", true);
  hud.setStatus("ASL words and Meet captions are ready. Start the camera.", "success");

  async function startCamera() {
    try {
      hud.setStatus("Loading local ASL models and camera…", "info");
      await vision.start();
      hud.setCameraRunning(true);
      hud.setStatus(`Camera ready. ${vision.modelInfo.words} ASL words and ${vision.modelInfo.letters} static letters loaded. Words have priority.`, "success");
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

  function removeGloss(index) {
    glossBuffer.splice(index, 1);
    hud.renderGlosses(glossBuffer, removeGloss);
    scheduleLiveGeneration();
  }

  function addGloss() {
    const gloss = hud.getCalibrationGloss();
    if (!gloss) return;
    glossBuffer.push(gloss);
    hud.renderGlosses(glossBuffer, removeGloss);
    hud.setStatus(`Added ${gloss} manually.`, "success");
    scheduleLiveGeneration();
  }

  function clearGlosses() {
    cancelLiveTimer();
    glossBuffer = [];
    hud.renderGlosses(glossBuffer, removeGloss);
    hud.setStatus("Current phrase cleared.", "info");
  }

  function scheduleLiveGeneration() {
    if (!glossBuffer.length || handsPresent || liveGenerating) return;
    cancelLiveTimer();
    hud.setLiveState("Hands lowered — translating the completed phrase", true);
    liveTimer = setTimeout(flushLivePhrase, Math.max(settings.livePauseMs || 0, 2000));
  }

  async function flushLivePhrase() {
    liveTimer = null;
    if (!glossBuffer.length || handsPresent || liveGenerating) return;
    const question = hud.getQuestion() || latestCaption;
    if (!question) {
      hud.setLiveState("Waiting for the interviewer question", true);
      return;
    }
    const phrase = [...glossBuffer];
    liveGenerating = true;
    let completed = false;
    hud.setLiveState("Gemma 4 is rendering the signed meaning…", true);
    try {
      const response = await generateAnswer(settings, question, collapseFingerspelling(phrase));
      const answer = String(response.result?.answer || "").trim();
      if (!answer) throw new Error("Gemma returned an empty answer");
      hud.setAnswer(answer, Boolean(response.result.needs_clarification));
      hud.setMetrics(response.metrics);
      if (response.result.needs_clarification) {
        hud.setStatus("Meaning is unclear. Review the answer before speaking.", "warn");
        return;
      }
      speakText(answer);
      let delivered = false;
      try {
        await meet.sendChatMessage(`🤟 Candidate via SignBridge: ${answer}`);
        delivered = true;
      } catch {
        // Chat delivery depends on Meet's visible chat controls.
      }
      if (phrase.every((gloss, index) => glossBuffer[index] === gloss)) glossBuffer.splice(0, phrase.length);
      completed = true;
      hud.renderGlosses(glossBuffer, removeGloss);
      hud.setLiveState("Spoken — listening for the next phrase", true);
      hud.setStatus(delivered
        ? "Spoken locally and sent in Meet chat."
        : "Spoken locally. Meet chat delivery is unavailable.", delivered ? "success" : "warn");
    } catch (error) {
      hud.setStatus(`Gemma 4 unavailable: ${error.message}. Nothing was spoken.`, "warn");
    } finally {
      liveGenerating = false;
      if (completed && glossBuffer.length && !handsPresent) scheduleLiveGeneration();
    }
  }

  function cancelLiveTimer() {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = null;
  }

  function speakText(text) {
    lastSpokenText = text;
    lastSpokenAt = Date.now();
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = settings.speechRate;
    speechSynthesis.speak(utterance);
  }

  function isRecentSpokenCaption(caption) {
    if (!lastSpokenText || Date.now() - lastSpokenAt > 15000) return false;
    const observed = normalizePhrase(caption);
    const spoken = normalizePhrase(lastSpokenText);
    return observed.length > 10 && (observed.includes(spoken) || spoken.includes(observed));
  }

  function speak() {
    const answer = hud.getAnswer();
    if (answer) speakText(answer);
  }

  async function copy() {
    const answer = hud.getAnswer();
    if (answer) await navigator.clipboard.writeText(answer);
  }

  function insertChat() {
    const answer = hud.getAnswer();
    if (!answer) return;
    try {
      meet.insertChatDraft(`🤟 Candidate via SignBridge: ${answer}`);
      hud.setStatus("Draft inserted in Meet chat.", "success");
    } catch (error) {
      hud.setStatus(error.message, "warn");
    }
  }

  async function handleSaveSettings() {
    const form = hud.getSettingsForm();
    if (!form.endpoint || !form.model) {
      hud.setStatus("Endpoint and model are required.", "warn");
      return;
    }
    settings = await saveSettings({ ...settings, ...form });
    hud.setSettings(settings);
    hud.setStatus("Gemma 4 settings saved.", "success");
  }

  async function handleCheckGemma() {
    await handleSaveSettings();
    try {
      const health = await checkGemma(settings);
      hud.setStatus(health.installed ? `Gemma 4 ready: ${settings.model}` : `Model ${settings.model} is not installed.`, health.installed ? "success" : "warn");
    } catch (error) {
      hud.setStatus(`Gemma endpoint unavailable: ${error.message}`, "error");
    }
  }
}

function normalizePhrase(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeQuestion(value) {
  return /\b(what|why|how|when|where|who|which|can|could|would|will|do|does|did|have|has|tell|describe|explain|please|walk)\b/.test(normalizePhrase(value));
}

function collapseFingerspelling(glosses) {
  const result = [];
  let letters = "";
  const flush = () => {
    if (letters) result.push(`FINGERSPELL:${letters}`);
    letters = "";
  };
  for (const gloss of glosses) {
    if (/^[A-Z]$/.test(gloss)) letters += gloss;
    else { flush(); result.push(gloss); }
  }
  flush();
  return result;
}
