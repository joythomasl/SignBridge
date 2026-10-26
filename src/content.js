import { VisionController } from "./vision.js";
import { SignBridgeHud } from "./hud.js";
import { MeetAdapter } from "./meet-adapter.js";
import { StableGestureDetector, TemporalGestureDetector, averageVectors, findBestMatch } from "./recognizer.js";
import { checkGemma, generateAnswer, mapQuestionToSign } from "./gemma.js";
import { getSettings, getTemplates, saveSettings, saveTemplate } from "./storage.js";
import { deleteClip, getClip, listClips, saveClip } from "./clip-store.js";
import { DEMO_GLOSSES, INTENTS } from "./constants.js";

if (!document.getElementById("signbridge-root")) {
  boot().catch((error) => console.error("SignBridge failed to start", error));
}

async function boot() {
  let settings = await getSettings();
  const builtInTemplates = await loadBuiltInRecognitionTemplates();
  const wordTemplates = await loadBuiltInWordTemplates();
  let templates = { ...builtInTemplates, ...(await getTemplates()) };
  const signLibrary = await loadBundledSignLibrary();
  const fingerspellingLibrary = await loadFingerspellingLibrary();
  const signClipsById = new Map(signLibrary.clips.map((clip) => [clip.id, clip]));
  const fingerspellingByLabel = new Map(fingerspellingLibrary.signs.map((sign) => [sign.label, sign.frame]));
  const candidateVocabulary = [...new Set([
    ...DEMO_GLOSSES,
    ...signLibrary.clips.map((clip) => clip.label.toUpperCase()),
    ...fingerspellingLibrary.signs.map((sign) => sign.label)
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
  let autoQuestionTimer = null;
  let reverseGenerating = false;
  let queuedQuestion = "";
  let lastTranslatedQuestion = "";
  let lastSpokenText = "";
  let lastSpokenAt = 0;

  const hud = new SignBridgeHud({
    startCamera,
    stopCamera,
    calibrate,
    addGloss,
    clearGlosses,
    questionChanged: scheduleAutoQuestion,
    speak,
    copy,
    insertChat,
    saveSettings: handleSaveSettings,
    checkGemma: handleCheckGemma,
    replaySign: () => hud.replaySign(),
    slowerSign: () => hud.slowerSign(),
    recordClip,
    stopRecording,
    deleteClip: handleDeleteClip
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

  const wordDetector = new TemporalGestureDetector({
    templates: wordTemplates,
    onCandidate: (match) => {
      if (match?.gloss && match.score >= 0.7) hud.setDetected({ ...match, handPresent: true });
    },
    onAccept: ({ gloss }) => {
      if (!gloss) return;
      detector.reset();
      glossBuffer.push(gloss);
      hud.renderGlosses(glossBuffer, removeGloss);
      hud.setStatus(`Word accepted: ${gloss}`, "success");
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
        wordDetector.update(null);
        return;
      }
      if (calibration) {
        calibration.samples.push(vector);
        const progress = Math.min((performance.now() - calibration.startedAt) / calibration.durationMs, 1);
        hud.setCalibrationState(`Hold ${calibration.gloss} steady…`, progress);
        return;
      }
      if (mediaRecorder?.state === "recording") return;
      const match = { ...findBestMatch(vector, templates), handPresent: true };
      detector.update(match);
      wordDetector.update(vector);
    },
    onError(error) {
      hud.setStatus(`Vision error: ${error.message}`, "error");
    }
  });

  const meet = new MeetAdapter({
    onCaption(caption) {
      latestCaption = caption;
      hud.showLatestCaption(caption);
      if (looksLikeQuestion(caption) && !isRecentSpokenCaption(caption)) {
        hud.setQuestion(caption, "caption");
        scheduleAutoQuestion(caption);
      }
    }
  });
  meet.start();

  await updateClipInventory();
  hud.setLiveState("Always-live mode ready — start the camera to begin", true);
  hud.setStatus("Always-live mode ready. Meet questions and signed responses are processed automatically.", "success");

  async function startCamera() {
    try {
      hud.setStatus("Starting camera and MediaPipe…", "info");
      await vision.start();
      hud.setCameraRunning(true);
      const calibratedCount = Object.keys(templates).length - Object.keys(builtInTemplates).length;
      hud.setStatus(`Camera ready. ${Object.keys(wordTemplates).length} words · ${Object.keys(builtInTemplates).length} fingerspelling signs loaded${calibratedCount > 0 ? ` · ${calibratedCount} custom calibrations` : ""}.`, "success");
    } catch (error) {
      hud.setCameraRunning(false);
      hud.setStatus(`Camera unavailable: ${error.message}`, "error");
    }
  }

  function stopCamera() {
    cancelLiveTimer();
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    vision.stop();
    detector.reset();
    wordDetector.reset();
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
    templates = { ...builtInTemplates, ...(await saveTemplate(gloss, vector)) };
    detector.reset();
    wordDetector.reset();
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
    wordDetector.reset();
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
      const response = await generateAnswer(settings, question, collapseFingerspelling(glosses));
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
    if (!glossBuffer.length) return;
    cancelLiveTimer();
    hud.setLiveState("Signing detected — pause briefly to speak", true);
    liveTimer = setTimeout(flushLivePhrase, settings.livePauseMs || 1200);
  }

  async function flushLivePhrase() {
    liveTimer = null;
    if (!glossBuffer.length) return;
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

  function scheduleAutoQuestion(question) {
    const normalized = String(question || "").trim();
    if (!normalized || normalized === lastTranslatedQuestion) return;
    clearTimeout(autoQuestionTimer);
    hud.setStatus("Interviewer question detected — preparing ISL…", "info");
    autoQuestionTimer = setTimeout(() => translateToSign(normalized), 450);
  }

  async function translateToSign(questionOverride = "") {
    const question = questionOverride || hud.getQuestion();
    if (!question) {
      return;
    }
    if (reverseGenerating) {
      queuedQuestion = question;
      return;
    }
    const localExact = signLibrary.clips.find((clip) => normalizePhrase(clip.label) === normalizePhrase(question));
    if (localExact) {
      hud.showSignResult({
        question,
        glosses: [localExact.label.toUpperCase()],
        clipUrl: null,
        frameSequences: [{ fps: localExact.fps, frames: localExact.frames.map((frame) => chrome.runtime.getURL(frame)) }],
        exact: true,
        quality: "Dataset phrase clip · review"
      });
      lastTranslatedQuestion = question;
      hud.setStatus("Interviewer question detected and exact dataset animation started.", "warn");
      return;
    }
    const spellingSequence = createFingerspellingSequence(question);
    if (spellingSequence.frames.length) {
      hud.showSignResult({
        question,
        glosses: ["LIVE FINGERSPELLING"],
        clipUrl: null,
        frameSequences: [spellingSequence],
        exact: false,
        quality: "Live fingerspelling · approximate"
      });
      hud.setStatus("Question detected — fingerspelling started while Gemma selects the best ISL clips.", "info");
    }
    reverseGenerating = true;
    hud.setStatus("Gemma 4 is mapping the question to verified ISL…", "info");
    try {
      const availableClips = signLibrary.clips.map(({ id, label, kind }) => ({ id, label, kind }));
      const response = await mapQuestionToSign(settings, question, INTENTS, availableClips);
      const result = response.result || {};
      const validIntent = INTENTS.some((item) => item.id === result.intent) ? result.intent : "UNSUPPORTED";
      const mappedExactBuiltIn = result.exact_clip !== "NONE" ? signClipsById.get(result.exact_clip) : null;
      const selectedIds = mappedExactBuiltIn
        ? [mappedExactBuiltIn.id]
        : Array.isArray(result.clips) ? result.clips.filter((id) => signClipsById.has(id)).slice(0, 8) : [];
      const selectedClips = selectedIds.map((id) => signClipsById.get(id));
      const glosses = selectedClips.map((item) => item.label.toUpperCase());
      const clip = validIntent === "UNSUPPORTED" ? null : await getClip(validIntent);
      if (signClipUrl) URL.revokeObjectURL(signClipUrl);
      signClipUrl = clip?.blob ? URL.createObjectURL(clip.blob) : null;
      const datasetSequences = selectedClips.map((item) => ({
        fps: item.fps,
        frames: item.frames.map((frame) => chrome.runtime.getURL(frame))
      }));
      const usingFingerspelling = !signClipUrl && !datasetSequences.length && spellingSequence.frames.length;
      const frameSequences = signClipUrl ? [] : datasetSequences.length ? datasetSequences : usingFingerspelling ? [spellingSequence] : [];
      const quality = signClipUrl
        ? "Verified signer recording"
        : mappedExactBuiltIn
          ? "Dataset phrase clip · review"
          : datasetSequences.length
            ? "Approximate dataset sequence"
            : usingFingerspelling
              ? "Live fingerspelling · approximate"
            : "Unsupported";
      hud.showSignResult({
        question,
        glosses,
        clipUrl: signClipUrl,
        frameSequences,
        exact: Boolean(signClipUrl || mappedExactBuiltIn),
        quality,
        message: validIntent === "UNSUPPORTED"
          ? "This question is outside the supported interview intents. Read the caption; only available dataset concepts are shown."
          : `No custom recording or useful dataset sequence is available for ${validIntent}.`
      });
      hud.setMetrics(response.metrics);
      if (signClipUrl) hud.setStatus("Verified ISL signer recording is playing.", "success");
      else if (mappedExactBuiltIn) hud.setStatus("Exact dataset phrase is playing. Review its ISL accuracy before the demo.", "warn");
      else if (datasetSequences.length) hud.setStatus("Approximate dataset sequence is playing with the original caption retained.", "warn");
      else if (usingFingerspelling) hud.setStatus("No phrase match; the question is being fingerspelled with its caption retained.", "warn");
      else hud.setStatus("No matching dataset clip is available. Caption retained; no false signing shown.", "warn");
      lastTranslatedQuestion = question;
    } catch (error) {
      hud.showSignResult({
        question,
        glosses: spellingSequence.frames.length ? ["LIVE FINGERSPELLING"] : [],
        clipUrl: null,
        frameSequences: spellingSequence.frames.length ? [spellingSequence] : [],
        exact: false,
        quality: spellingSequence.frames.length ? "Live fingerspelling · approximate" : "Unsupported",
        message: `Could not map this question: ${error.message}`
      });
      hud.setStatus(spellingSequence.frames.length ? "Gemma mapping failed; live fingerspelling continues." : `Question-to-ISL failed: ${error.message}`, "warn");
    } finally {
      reverseGenerating = false;
      if (queuedQuestion && queuedQuestion !== question) {
        const nextQuestion = queuedQuestion;
        queuedQuestion = "";
        scheduleAutoQuestion(nextQuestion);
      }
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
    const captionText = normalizePhrase(caption);
    const spokenText = normalizePhrase(lastSpokenText);
    return captionText.length > 10 && (captionText.includes(spokenText) || spokenText.includes(captionText));
  }

  function createFingerspellingSequence(text) {
    const frames = [];
    for (const character of String(text || "").toUpperCase().slice(0, 80)) {
      const frame = fingerspellingByLabel.get(character);
      if (frame) frames.push(chrome.runtime.getURL(frame));
      else if (/\s/.test(character) && frames.length) frames.push(frames.at(-1), frames.at(-1));
    }
    return { fps: 4, frames };
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

function normalizePhrase(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeQuestion(value) {
  const text = normalizePhrase(value);
  return /\b(what|why|how|when|where|who|which|can|could|would|will|do|does|did|have|has|tell|describe|explain|please|walk)\b/.test(text);
}

function collapseFingerspelling(glosses) {
  const collapsed = [];
  let letters = "";
  const flush = () => {
    if (letters) collapsed.push(`FINGERSPELL:${letters}`);
    letters = "";
  };
  for (const gloss of glosses) {
    if (/^[A-Z1-9]$/.test(gloss)) letters += gloss;
    else {
      flush();
      collapsed.push(gloss);
    }
  }
  flush();
  return collapsed;
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

async function loadFingerspellingLibrary() {
  try {
    const response = await fetch(chrome.runtime.getURL("assets/signs/fingerspelling.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return { ...manifest, signs: Array.isArray(manifest.signs) ? manifest.signs : [] };
  } catch (error) {
    console.warn("SignBridge fingerspelling library unavailable", error);
    return { version: 1, signs: [] };
  }
}

async function loadBuiltInRecognitionTemplates() {
  try {
    const response = await fetch(chrome.runtime.getURL("assets/signs/fingerspelling-templates.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return manifest.templates && typeof manifest.templates === "object" ? manifest.templates : {};
  } catch (error) {
    console.warn("SignBridge recognition templates unavailable", error);
    return {};
  }
}

async function loadBuiltInWordTemplates() {
  try {
    const response = await fetch(chrome.runtime.getURL("assets/signs/word-templates.json"));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    return manifest.templates && typeof manifest.templates === "object" ? manifest.templates : {};
  } catch (error) {
    console.warn("SignBridge word recognition templates unavailable", error);
    return {};
  }
}
