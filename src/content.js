import { VisionController } from "./vision.js";
import { SignBridgeHud } from "./hud.js";
import { MeetAdapter } from "./meet-adapter.js";
import { StableGestureDetector, averageVectors, findBestMatch } from "./recognizer.js";
import { checkGemma, generateAnswer, mapQuestionToSign } from "./gemma.js";
import { getSettings, getTemplates, saveSettings, saveTemplate } from "./storage.js";
import { deleteClip, getClip, listClips, saveClip } from "./clip-store.js";
import { DEMO_GLOSSES, INTENTS } from "./constants.js";

if (!document.getElementById("signbridge-root")) {
  boot().catch((error) => console.error("SignBridge failed to start", error));
}

async function boot() {
  let settings = await getSettings();
  let templates = await getTemplates();
  const signLibrary = await loadBundledSignLibrary();
  const signClipsById = new Map(signLibrary.clips.map((clip) => [clip.id, clip]));
  const candidateVocabulary = [...new Set([
    ...DEMO_GLOSSES,
    ...signLibrary.clips.map((clip) => clip.label.toUpperCase())
  ])].sort();
  let glossBuffer = [];
  let latestCaption = "";
  let calibration = null;
  let mediaRecorder = null;
  let recordingChunks = [];
  let recordingIntent = null;
  let signClipUrl = null;
  let liveTimer = null;
  let liveGenerating = false;

  const hud = new SignBridgeHud({
    startCamera,
    stopCamera,
    calibrate,
    addGloss,
    clearGlosses,
    generateAnswer: handleGenerateAnswer,
    translateToSign,
    useLatestCaption,
    speak,
    copy,
    insertChat,
    saveSettings: handleSaveSettings,
    checkGemma: handleCheckGemma,
    replaySign: () => hud.replaySign(),
    slowerSign: () => hud.slowerSign(),
    recordClip,
    stopRecording,
    deleteClip: handleDeleteClip,
    toggleLiveMode: handleToggleLiveMode
  }, candidateVocabulary);
  hud.setSettings(settings);
  hud.renderGlosses(glossBuffer, removeGloss);

  const detector = new StableGestureDetector({
    threshold: settings.detectionThreshold,
    holdMs: settings.detectionHoldMs,
    cooldownMs: settings.detectionCooldownMs,
    onCandidate: (match) => {
      hud.setDetected(match);
      if (match?.gloss) scheduleLiveGeneration();
    },
    onAccept: ({ gloss }) => {
      if (!gloss) return;
      glossBuffer.push(gloss);
      hud.renderGlosses(glossBuffer, removeGloss);
      hud.setStatus(`Sign accepted: ${gloss}`, "success");
      scheduleLiveGeneration();
    }
  });

  const vision = new VisionController({
    video: hud.video,
    canvas: hud.canvas,
    fps: settings.inferenceFps,
    onVector(vector) {
      if (!vector) {
        hud.setDetected(null);
        detector.update({ gloss: null, score: 0 });
        return;
      }
      if (calibration) {
        calibration.samples.push(vector);
        const progress = Math.min((performance.now() - calibration.startedAt) / calibration.durationMs, 1);
        hud.setCalibrationState(`Hold ${calibration.gloss} steady…`, progress);
        return;
      }
      if (mediaRecorder?.state === "recording") return;
      detector.update(findBestMatch(vector, templates));
    },
    onError(error) {
      hud.setStatus(`Vision error: ${error.message}`, "error");
    }
  });

  const meet = new MeetAdapter({
    onCaption(caption) {
      latestCaption = caption;
      hud.showLatestCaption(caption);
    }
  });
  meet.start();

  await updateClipInventory();
  hud.setStatus("Ready. Check Gemma, record ISL clips, then start the camera.", "info");

  async function startCamera() {
    try {
      hud.setStatus("Starting camera and MediaPipe…", "info");
      await vision.start();
      hud.setCameraRunning(true);
      hud.setStatus("Camera ready. Calibrate or begin signing.", "success");
    } catch (error) {
      hud.setCameraRunning(false);
      hud.setStatus(`Camera unavailable: ${error.message}`, "error");
    }
  }

  function stopCamera() {
    cancelLiveTimer();
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    vision.stop();
    hud.setCameraRunning(false);
    hud.setDetected(null);
    hud.setStatus("Camera stopped.", "info");
  }

  async function calibrate() {
    if (!vision.getStream()) {
      await startCamera();
      if (!vision.getStream()) return;
    }
    if (calibration) return;
    const gloss = hud.getCalibrationGloss();
    hud.setCalibrationState(`Get ready to hold ${gloss}…`);
    await delay(650);
    calibration = {
      gloss,
      samples: [],
      startedAt: performance.now(),
      durationMs: 1700
    };
    await delay(calibration.durationMs);
    const completed = calibration;
    calibration = null;
    if (completed.samples.length < 8) {
      hud.setCalibrationState(`Calibration failed: only ${completed.samples.length} usable frames. Try again.`);
      return;
    }
    const vector = averageVectors(completed.samples);
    templates = await saveTemplate(gloss, vector);
    detector.reset();
    hud.setCalibrationState(`${gloss} calibrated from ${completed.samples.length} frames.`);
    hud.setStatus(`${gloss} calibration saved locally.`, "success");
  }

  function removeGloss(index) {
    glossBuffer.splice(index, 1);
    hud.renderGlosses(glossBuffer, removeGloss);
    scheduleLiveGeneration();
  }

  function addGloss() {
    const gloss = hud.getCalibrationGloss();
    glossBuffer.push(gloss);
    hud.renderGlosses(glossBuffer, removeGloss);
    hud.setStatus(`Added ${gloss} manually.`, "success");
    scheduleLiveGeneration();
  }

  function clearGlosses() {
    cancelLiveTimer();
    glossBuffer = [];
    detector.reset();
    hud.renderGlosses(glossBuffer, removeGloss);
    hud.setStatus("Gloss buffer cleared.", "info");
  }

  async function handleGenerateAnswer() {
    const question = hud.getQuestion();
    if (!question) {
      hud.setStatus("Add the interviewer’s question first.", "warn");
      return;
    }
    if (!glossBuffer.length) {
      hud.setStatus("Sign or add at least one calibrated gloss first.", "warn");
      return;
    }
    await generateFromGlosses(question, [...glossBuffer], false);
  }

  async function generateFromGlosses(question, glosses, live) {
    hud.setStatus(live ? "Live mode: translating the signed phrase…" : "Gemma 4 is rendering the signed meaning…", "info");
    try {
      const response = await generateAnswer(settings, question, glosses);
      const result = response.result || {};
      const answer = String(result.answer || "").trim();
      if (!answer) throw new Error("Gemma returned an empty answer");
      hud.setAnswer(answer, Boolean(result.needs_clarification));
      hud.setMetrics(response.metrics);
      if (live && !result.needs_clarification) {
        speakText(answer);
        removeProcessedGlosses(glosses);
        hud.setLiveState("Spoken — listening for the next phrase", true);
        hud.setStatus("Live sign-to-audio response spoken. Listening continues.", "success");
      } else if (live) {
        hud.setLiveState("Clarification needed — nothing was spoken", true);
      } else if (!result.needs_clarification) {
        hud.setStatus("Answer ready. Review and approve it before delivery.", "success");
      }
    } catch (error) {
      const literal = `My response is: ${glosses.join(" ").toLowerCase()}.`;
      hud.setAnswer(literal, true);
      hud.setMetrics(null);
      if (live) {
        hud.setLiveState("Live translation failed — nothing was spoken", true);
        hud.setStatus(`Live Gemma unavailable (${error.message}). Nothing was spoken automatically.`, "warn");
      } else {
        hud.setStatus(`Gemma unavailable (${error.message}). Showing a literal fallback.`, "warn");
      }
    }
  }

  function scheduleLiveGeneration() {
    if (!hud.isLiveMode() || !glossBuffer.length) return;
    cancelLiveTimer();
    hud.setLiveState("Signing detected — pause briefly to speak", true);
    liveTimer = setTimeout(flushLivePhrase, settings.livePauseMs || 1200);
  }

  async function flushLivePhrase() {
    liveTimer = null;
    if (!hud.isLiveMode() || !glossBuffer.length) return;
    if (liveGenerating) {
      scheduleLiveGeneration();
      return;
    }
    const question = hud.getQuestion();
    if (!question) {
      hud.setLiveState("Add or capture the interviewer question first", true);
      hud.setStatus("Live audio needs the interviewer’s question for context.", "warn");
      return;
    }
    const phrase = [...glossBuffer];
    liveGenerating = true;
    try {
      await generateFromGlosses(question, phrase, true);
    } finally {
      liveGenerating = false;
      if (glossBuffer.length) scheduleLiveGeneration();
    }
  }

  function removeProcessedGlosses(processed) {
    const samePrefix = processed.every((gloss, index) => glossBuffer[index] === gloss);
    if (samePrefix) glossBuffer.splice(0, processed.length);
    hud.renderGlosses(glossBuffer, removeGloss);
  }

  function cancelLiveTimer() {
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = null;
  }

  async function handleToggleLiveMode(enabled) {
    settings = await saveSettings({ ...settings, liveSignToAudio: enabled });
    if (enabled) {
      hud.setLiveState("Live audio ready — pause briefly to speak", true);
      hud.setStatus("Live sign-to-audio enabled. Recognized phrases will be spoken automatically.", "success");
      scheduleLiveGeneration();
    } else {
      cancelLiveTimer();
      speechSynthesis.cancel();
      hud.setLiveState("Live audio is off", false);
      hud.setStatus("Live sign-to-audio disabled.", "info");
    }
  }

  async function translateToSign() {
    const question = hud.getQuestion();
    if (!question) {
      hud.setStatus("Add the interviewer’s question first.", "warn");
      return;
    }
    hud.setStatus("Gemma 4 is mapping the question to verified ISL…", "info");
    try {
      const availableClips = signLibrary.clips.map(({ id, label, kind }) => ({ id, label, kind }));
      const response = await mapQuestionToSign(settings, question, INTENTS, availableClips);
      const result = response.result || {};
      const validIntent = INTENTS.some((item) => item.id === result.intent) ? result.intent : "UNSUPPORTED";
      const exactBuiltIn = result.exact_clip !== "NONE" ? signClipsById.get(result.exact_clip) : null;
      const selectedIds = exactBuiltIn
        ? [exactBuiltIn.id]
        : Array.isArray(result.clips) ? result.clips.filter((id) => signClipsById.has(id)).slice(0, 8) : [];
      const selectedClips = selectedIds.map((id) => signClipsById.get(id));
      const glosses = selectedClips.map((item) => item.label.toUpperCase());
      const clip = validIntent === "UNSUPPORTED" ? null : await getClip(validIntent);
      if (signClipUrl) URL.revokeObjectURL(signClipUrl);
      signClipUrl = clip?.blob ? URL.createObjectURL(clip.blob) : null;
      const frameSequences = signClipUrl ? [] : selectedClips.map((item) => ({
        fps: item.fps,
        frames: item.frames.map((frame) => chrome.runtime.getURL(frame))
      }));
      const quality = signClipUrl
        ? "Verified signer recording"
        : exactBuiltIn
          ? "Dataset phrase clip · review"
          : frameSequences.length
            ? "Approximate dataset sequence"
            : "Unsupported";
      hud.showSignResult({
        question,
        glosses,
        clipUrl: signClipUrl,
        frameSequences,
        exact: Boolean(signClipUrl || exactBuiltIn),
        quality,
        message: validIntent === "UNSUPPORTED"
          ? "This question is outside the supported interview intents. Read the caption; only available dataset concepts are shown."
          : `No custom recording or useful dataset sequence is available for ${validIntent}.`
      });
      hud.setMetrics(response.metrics);
      if (signClipUrl) hud.setStatus("Verified ISL signer recording is playing.", "success");
      else if (exactBuiltIn) hud.setStatus("Exact dataset phrase is playing. Review its ISL accuracy before the demo.", "warn");
      else if (frameSequences.length) hud.setStatus("Approximate dataset sequence is playing with the original caption retained.", "warn");
      else hud.setStatus("No matching dataset clip is available. Caption retained; no false signing shown.", "warn");
    } catch (error) {
      hud.showSignResult({ question, glosses: [], clipUrl: null, exact: false, message: `Could not map this question: ${error.message}` });
      hud.setStatus(`Question-to-ISL failed: ${error.message}`, "error");
    }
  }

  function useLatestCaption() {
    if (!latestCaption) {
      hud.setStatus("No Meet caption detected. Turn captions on or type the question.", "warn");
      return;
    }
    hud.setQuestion(latestCaption, "caption");
    hud.setStatus("Latest Meet caption selected.", "success");
  }

  function speak() {
    const answer = hud.getAnswer();
    if (!answer) return;
    speakText(answer);
    hud.setStatus("Speaking approved answer locally.", "success");
  }

  function speakText(text) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = settings.speechRate;
    speechSynthesis.speak(utterance);
  }

  async function copy() {
    const answer = hud.getAnswer();
    if (!answer) return;
    await navigator.clipboard.writeText(answer);
    hud.setStatus("Approved answer copied.", "success");
  }

  function insertChat() {
    const answer = hud.getAnswer();
    if (!answer) return;
    try {
      meet.insertChatDraft(`🤟 Candidate via SignBridge: ${answer}`);
      hud.setStatus("Draft inserted. Review it in Meet and press Send yourself.", "success");
    } catch (error) {
      navigator.clipboard.writeText(answer).catch(() => {});
      hud.setStatus(`${error.message} The answer was copied instead.`, "warn");
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
    hud.setStatus("Gemma settings saved locally.", "success");
  }

  async function handleCheckGemma() {
    await handleSaveSettings();
    hud.setStatus("Checking Gemma 4 endpoint…", "info");
    try {
      const health = await checkGemma(settings);
      if (health.installed) hud.setStatus(`Gemma 4 ready: ${settings.model}`, "success");
      else hud.setStatus(`Endpoint is online, but ${settings.model} is not installed.`, "warn");
    } catch (error) {
      hud.setStatus(`Gemma endpoint unavailable: ${error.message}`, "error");
    }
  }

  async function recordClip() {
    if (!vision.getStream()) {
      await startCamera();
      if (!vision.getStream()) return;
    }
    if (mediaRecorder?.state === "recording") return;
    recordingIntent = hud.getClipIntent();
    recordingChunks = [];
    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
    mediaRecorder = new MediaRecorder(vision.getStream(), mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data?.size) recordingChunks.push(event.data);
    };
    mediaRecorder.onerror = (event) => {
      hud.setRecording(false, `Recording error: ${event.error?.message || "unknown error"}`);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "video/webm" });
      if (blob.size < 1000) {
        hud.setRecording(false, "Recording was empty. Try again.");
        return;
      }
      await saveClip(recordingIntent, blob);
      hud.setRecording(false, `${recordingIntent} saved locally (${(blob.size / 1024).toFixed(0)} KB).`);
      hud.setStatus("Verified ISL phrase clip saved. Review it before the demo.", "success");
      await updateClipInventory();
    };
    mediaRecorder.start(250);
    hud.setRecording(true, `Recording ${recordingIntent}… perform the complete verified ISL phrase.`);
    hud.setStatus("Recording ISL phrase. Press Stop & save when complete.", "warn");
  }

  function stopRecording() {
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  }

  async function handleDeleteClip() {
    const intent = hud.getClipIntent();
    await deleteClip(intent);
    hud.setRecording(false, `${intent} recording deleted.`);
    hud.setStatus("ISL phrase clip deleted.", "info");
    await updateClipInventory();
  }

  async function updateClipInventory() {
    const clips = await listClips();
    const recorded = new Set(clips.map((clip) => clip.intent));
    const count = INTENTS.filter((intent) => recorded.has(intent.id)).length;
    hud.setRecording(false, `${signLibrary.clips.length} bundled dataset clips · ${count}/${INTENTS.length} verified custom phrases.`);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadBundledSignLibrary() {
  try {
    const response = await fetch(chrome.runtime.getURL("assets/signs/library.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return { ...manifest, clips: Array.isArray(manifest.clips) ? manifest.clips : [] };
  } catch (error) {
    console.warn("SignBridge bundled sign library unavailable", error);
    return { version: 1, clips: [] };
  }
}
