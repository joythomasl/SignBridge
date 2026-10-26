# SignBridge AI — 24-Hour Hackathon Build Plan

**Goal:** Deliver a reliable Chrome-extension demo that shows a bidirectional accessibility workflow in Google Meet and visibly uses Gemma 4.  
**Build window:** 24 hours  
**Starting state:** Empty implementation workspace; only planning documentation exists.

## 1. The honest product promise

Build a **Gemma 4-powered, limited-vocabulary interview communication assistant**, not a general autonomous ISL interpreter.

The demo must show this complete loop:

1. The interviewer asks a question.
2. SignBridge obtains the question from Meet captions or manual text fallback.
3. The candidate performs a small set of calibrated signs.
4. MediaPipe converts the signs into a gloss buffer.
5. Gemma 4 converts the question plus glosses into a concise answer without inventing facts.
6. The candidate reviews and approves the answer.
7. SignBridge displays it, speaks it locally, and inserts or copies it into Meet chat.
8. In the reverse direction, Gemma 4 maps the interviewer’s text to a supported ISL intent/gloss sequence and the extension plays verified ISL video clips in a signing panel.

Demo wording:

> “A privacy-capable Chrome accessibility prototype that uses on-device hand tracking and Gemma 4 to turn a small, calibrated ISL interview vocabulary into confirmed spoken-language responses.”

Do not call the 24-hour version a production interpreter, continuous ISL translator, or replacement for professional interpreters.

## 2. “Any laptop” versus local Gemma 4

A literal promise to run Gemma 4 locally on **every** laptop is impossible. The smallest current Ollama Gemma 4 E2B Q4 package is approximately 4.6 GB. Low-memory laptops, managed devices, and Chromebooks may not be able to install or run Ollama. Google’s own memory table also shows that inference requirements vary by runtime and quantization.

Use two inference modes behind one adapter:

| Mode | Use | Requirement | Privacy statement |
|---|---|---|---|
| **Local demo mode** | Primary judging demo | Ollama + `gemma4:e2b-it-q4_K_M`; 12 GB RAM recommended, 16 GB preferred | Gemma prompts stay on the laptop. Meet captions are still cloud-assisted if used. |
| **Universal extension mode** | Demonstrate portability to low-spec laptops | Internet access to a team-hosted Gemma 4 endpoint | Not zero-cloud; disclose clearly. |

The Chrome extension, UI, MediaPipe processing, and gesture templates remain the same in both modes. Only the Gemma endpoint changes.

Recommended model:

```text
gemma4:e2b-it-q4_K_M
```

Why E2B instead of E4B:

- It is still Gemma 4.
- The Ollama package is approximately 4.6 GB instead of approximately 6.6 GB for E4B Q4.
- It is more likely to work on an ordinary hackathon laptop while Chrome and Meet are running.
- Text-only prompts are sufficient because MediaPipe performs the vision work.

If the rules explicitly require E4B, keep the same architecture and swap the tag to `gemma4:e4b-it-q4_K_M` on the demonstration laptop. Do not promise that E4B runs well on low-memory machines.

## 3. Scope lock

### Must ship

- Manifest V3 Chrome extension for `https://meet.google.com/*`.
- Floating HUD that does not block Meet controls.
- Start/Stop camera processing.
- MediaPipe Hand Landmarker bundled with the extension.
- 8–12 demo signs, calibrated for the demo signer.
- Gloss buffer with Remove, Clear, and Finish controls.
- Interviewer question from Meet captions with manual-entry fallback.
- Gemma 4 health check and configurable local/remote endpoint.
- Gemma 4 question + gloss → short English answer.
- Strict preview and approval before any speech or chat action.
- Local browser TTS.
- Meet chat insertion if the selector works; clipboard fallback always available.
- Reverse path: question → Gemma 4 supported intent/gloss sequence → verified ISL phrase/word video playback.
- At least 5 complete interviewer-question phrase clips and 10–15 reusable word-level clips.
- Clear status states: Ready, Listening, Sign detected, Generating, Review, Error.
- A scripted 90-second demo and a backup screen recording.

### Build only if the must-ship path is stable

- Light/dark themes or visual polish beyond the core HUD.
- Configurable voice and speaking rate.
- Per-sign confidence visualization.
- Session transcript export.

### Explicitly cut

- Continuous natural ISL recognition.
- Model training or LoRA fine-tuning.
- Sending camera frames to Gemma 4.
- Facial-expression grammar recognition.
- 3D avatars or Three.js.
- Automatic injection into Meet’s outgoing microphone.
- Teams/Zoom support.
- Mobile support.
- Chrome Web Store publication.
- Fully automatic chat sending.
- Claims of medical, legal, employment, or enterprise compliance.

## 4. Technical architecture

```text
Meet captions -----------+
                         v
Camera -> MediaPipe -> gloss buffer -> Gemma 4 -> candidate review
                                                    |       |
                                                    v       v
                                              local TTS   Meet chat/copy

Interviewer text -> Gemma 4 intent/gloss selector -> verified ISL video player
```

### Extension components

```text
signbridge/
  manifest.json
  src/
    content.js          # Meet integration and HUD mount
    background.js       # Settings, endpoint requests, extension lifecycle
    hud.js               # UI state and controls
    vision.js            # Camera and MediaPipe loop
    recognizer.js         # Normalization, calibration, matching, debounce
    gemma.js              # Local/remote inference adapter
    meet-adapter.js       # Caption observer and chat insertion
    speech.js             # Browser TTS
    prompts.js            # Versioned constrained prompts
  styles/
    hud.css
  vendor/
    mediapipe/            # Bundled JS/WASM/model files
  assets/
    signs/
      phrases/            # Verified full-question ISL WebM/MP4 clips
      words/              # Verified reusable ISL word clips
      manifest.json       # Supported intents/glosses and clip metadata
  docs/
    SETUP.md
    DEMO_SCRIPT.md
```

### Performance rules

- Run hand detection at 12–15 FPS, not 60 FPS.
- Render the camera preview separately from inference FPS.
- Use one hand initially; add the second hand only if required by the selected signs.
- Send only text to Gemma 4.
- Keep the prompt under approximately 250 tokens.
- Set `think: false`, stream the response, and cap output at 40–50 tokens.
- Preload the model before the Meet demo and keep it warm.
- Never run two Gemma requests concurrently; cancel stale requests.
- Stop camera inference while Gemma is generating if the laptop struggles.

## 5. Gesture recognition strategy

Do not attempt to train a sign-language model in 24 hours. Use a calibration-driven template matcher.

### Calibration

1. Select 8–12 signs that are visually distinct and can be demonstrated reliably.
2. Verify the selected signs with an ISL reference or knowledgeable signer.
3. Record 20–30 landmark samples per sign from the demo signer.
4. Normalize each hand relative to the wrist and palm size.
5. Average the stable samples into a template and store it in `chrome.storage.local`.
6. Reject low-confidence observations instead of selecting the closest sign unconditionally.

### Runtime behavior

- Require similarity above the chosen threshold for approximately 400–600 ms.
- Add a 700–1,000 ms cooldown so one sign is not appended repeatedly.
- Display the detected gloss immediately and let the candidate delete it.
- Use a visible Finish button; do not guess phrase boundaries.
- Keep an explicit Unknown state.

Suggested demo vocabulary should match the scripted questions and remain small, for example concepts such as:

```text
ME, YES, NO, PYTHON, AI, PROJECT, EXPERIENCE, TEAM, SOLVE, THREE, YEAR, THANK-YOU
```

The exact gestures must not be invented by developers; confirm them against an ISL source before recording templates.

## 6. Gemma 4 responsibilities

Gemma 4 should do language transformation only. It must not recognize signs or create facts.

### Forward prompt contract

Input:

```json
{
  "question": "What experience do you have with Python and AI?",
  "glosses": ["ME", "PYTHON", "AI", "PROJECT", "THREE", "YEAR"]
}
```

Output schema:

```json
{
  "answer": "I have three years of experience working on Python and AI projects.",
  "used_glosses": ["ME", "PYTHON", "AI", "PROJECT", "THREE", "YEAR"],
  "needs_clarification": false
}
```

System rules:

- Write one first-person sentence, maximum 20 words.
- Use only information expressed by the glosses and question.
- Do not add tools, companies, achievements, metrics, methods, or examples.
- Preserve numbers and negation exactly.
- If the glosses do not contain enough information, set `needs_clarification` to `true` and keep the answer literal.
- Return valid JSON only.

Validate the response before showing it. If parsing fails, display a literal joined-gloss fallback instead of retrying repeatedly.

### Reverse prompt contract

Prefer complete phrase clips because natural sign language is not produced reliably by joining word cards. Gemma 4 first classifies the question into one of the verified phrase intents. Only when no phrase matches should it return a sequence of supported word clips, which the UI must label **Approximate signing**.

Input:

```json
{
  "question": "Tell me about your experience with Python projects.",
  "allowed_intents": [
    "ASK_INTRODUCTION",
    "ASK_EXPERIENCE",
    "ASK_PROJECT",
    "ASK_SKILLS",
    "ASK_TEAMWORK"
  ],
  "allowed_glosses": ["YOU", "PYTHON", "PROJECT", "EXPERIENCE", "EXPLAIN"]
}
```

Output:

```json
{
  "intent": "ASK_EXPERIENCE",
  "glosses": ["YOU", "PYTHON", "PROJECT", "EXPERIENCE", "EXPLAIN"],
  "phrase_clip_available": true
}
```

Gemma may select only from `allowed_intents` and `allowed_glosses`. The extension validates every returned value against `assets/signs/manifest.json` before playback. Unknown concepts remain visible in the text caption rather than being mapped to a misleading sign.

### Required ISL playback behavior

1. Read a finalized Meet caption or manual question.
2. Keep the original caption visible throughout playback.
3. Ask Gemma 4 for a supported phrase intent and optional allowed glosses.
4. If a phrase clip exists, play that complete verified clip.
5. Otherwise, play the verified word clips sequentially and show **Approximate signing**.
6. Provide Replay, Slower, Pause, and Show caption controls.
7. Never fabricate a clip, silently substitute ASL, or hide an unsupported word.

Initial phrase library for the demo:

```text
ASK_INTRODUCTION   -> "Please introduce yourself."
ASK_EXPERIENCE     -> "Tell me about your experience."
ASK_PROJECT        -> "Explain a project you worked on."
ASK_SKILLS         -> "What technical skills do you have?"
ASK_TEAMWORK       -> "How do you work with a team?"
```

The recordings must come from a knowledgeable ISL signer or a source whose language accuracy and reuse permission have been checked. Whole-question recordings should be used in the live demo.

## 7. 24-hour execution schedule

### Hour 0–1: Lock the demo

- Choose two interviewer questions and two candidate answers.
- Select 8–12 corresponding signs.
- Lock the five supported interviewer-question intents and identify the verified ISL phrase clips.
- Freeze the feature list and visual layout.
- Assign owners if more than one person is building.

Exit condition: everyone can recite the exact 90-second demo flow.

### Hour 1–4: Extension shell and HUD

- Initialize Git and create the MV3 structure.
- Add Meet host permission and content script.
- Mount the isolated HUD with Start, Stop, Clear, Finish, and Settings.
- Add a dedicated interviewer-sign panel with video, caption, Replay, Pause, and Slower controls.
- Implement explicit UI state transitions.
- Add manual question input immediately; it is the guaranteed fallback.

Exit condition: unpacked extension loads on Meet and the HUD survives simple layout changes.

### Hour 4–8: Camera and gesture path

- Bundle MediaPipe assets locally.
- Request camera permission only after Start is clicked.
- Add a 12–15 FPS landmark loop.
- Implement calibration, normalization, template storage, threshold, debounce, cooldown, and gloss buffer.
- Record templates for the demo signer.

Exit condition: the demo signer completes the two scripted gloss sequences successfully three times in a row.

Fallback at hour 7: if recognition is unstable, use large on-screen sign/intent buttons while keeping the camera landmark visualization. Do not sacrifice the end-to-end demo.

### Hour 8–11: Gemma 4 integration

- Install Ollama on the demo laptop.
- Pull `gemma4:e2b-it-q4_K_M`.
- Configure the demo extension origin for Ollama.
- Add health/model checks and a warm-up request.
- Implement JSON-schema prompts, `think: false`, token cap, timeout, cancellation, and literal fallback.
- Add remote endpoint configuration for universal mode.

Exit condition: both scripted gloss sequences produce safe answers in under five seconds after warm-up.

Fallback at hour 10: if local inference is too slow, run the same Gemma 4 model on the strongest team laptop and point the extension to that endpoint. Disclose that this is network mode.

### Hour 11–14: Candidate output

- Build Review/Edit, Speak, Copy, and Insert into chat actions.
- Make chat insertion fill the message but require a user click to send.
- Add clipboard fallback when Meet selectors fail.
- Confirm that no action occurs before approval.

Exit condition: a candidate can correct the answer and deliver it without leaving the Meet tab.

### Hour 14–17: Interviewer-to-candidate path

- Observe Meet captions with a MutationObserver.
- Add manual question fallback prominently.
- Send only finalized question text to Gemma 4.
- Validate the returned intent/glosses against the sign-asset manifest.
- Play the full verified ISL phrase clip when a matching intent exists.
- Fall back to sequential verified word clips labeled **Approximate signing**.
- Keep the original large caption visible beside the video.
- Add Replay, Pause, and Slower controls.

Exit condition: each scripted interviewer question reliably produces and plays the correct verified ISL phrase clip.

Fallback at hour 16: if caption scraping is unstable, use manual paste/typing for the live demo. Do not cut the ISL video playback path.

### Hour 17–20: Reliability and compatibility

- Test model unavailable, camera denied, captions off, malformed Gemma output, DOM selector failure, and page navigation.
- Add user-readable recovery messages.
- Test at 100%, 125%, and 150% display scaling.
- Test on a second Chrome laptop in remote inference mode.
- Run a 20-minute Meet soak test.

Exit condition: every failure has a visible fallback and the extension can be restarted without reloading Chrome.

### Hour 20–22: Demo and judging assets

- Record a backup video of the full successful workflow.
- Create a one-page architecture diagram.
- Prepare one slide listing honest limitations.
- Add a small badge that visibly identifies “Gemma 4 local” or “Gemma 4 network.”
- Record measured latency and hardware rather than using projected numbers.

### Hour 22–24: Freeze and rehearse

- No new features.
- Fix only demo-blocking defects.
- Rehearse the 90-second demo at least five times.
- Test from a fresh Chrome profile.
- Keep the model warm and the backup video locally available.

## 8. Team split

For three people:

| Owner | Workstream |
|---|---|
| A | Extension shell, HUD, Meet caption/chat adapters |
| B | MediaPipe, calibration, recognition, performance |
| C | Ollama/Gemma prompts, inference adapter, QA, demo/pitch |

For one person, follow the schedule sequentially and stop at the documented fallbacks. The forward sign-to-answer path has priority over the reverse visual-card path.

## 9. Definition of done

The hackathon build is complete when all of the following are true:

- The extension installs unpacked in a fresh Chrome profile.
- The HUD loads inside Google Meet without blocking call controls.
- The demo signer can produce both scripted gloss sequences three times consecutively.
- Gemma 4 is visibly identified and its health/model status is shown.
- Gemma produces no unsupported facts for the scripted and negative test cases.
- Candidate approval is required before TTS or chat insertion.
- The interviewer text always has a manual fallback.
- Each supported interviewer question plays the correct verified ISL phrase clip and retains the original caption.
- Unsupported questions are labeled clearly and never mapped silently to an unrelated clip.
- Chat always has a clipboard fallback.
- The extension works on a second laptop using network inference mode.
- The local-mode hardware, model tag, and measured latency are displayed honestly.
- A backup demonstration video exists.

## 10. Judge-facing story

### 20-second problem statement

> “Deaf candidates lose context and agency when remote interviews depend only on fast captions or unavailable interpreters. SignBridge gives the candidate a visible, controllable bridge inside the Meet tab.”

### 40-second technology explanation

> “MediaPipe performs lightweight hand tracking in Chrome. A calibrated recognizer builds a small ISL gloss sequence. Gemma 4 uses the interviewer’s question to render that sequence as concise English without adding facts. The candidate approves the result before it is spoken or placed in chat. In the other direction, Gemma 4 maps the interviewer’s caption to a verified ISL phrase or supported gloss sequence, which the extension plays as sign-language video.”

### 20-second differentiation

> “The interface is portable across Chrome laptops. On capable hardware Gemma 4 runs through local Ollama; on low-spec machines the same extension can use a disclosed Gemma 4 network endpoint. The architecture is local-first, but the demo never hides which mode is active.”

### 10-second roadmap

> “After the hackathon, the calibrated vocabulary becomes a temporal, signer-independent ISL model co-designed and evaluated with native ISL users.”

## 11. Claims allowed in the presentation

Use:

- “Gemma 4-powered.”
- “Local-first with a portability fallback.”
- “On-device hand landmark extraction.”
- “Small calibrated demo vocabulary.”
- “Candidate-controlled output.”
- “No per-request model API charge in local mode.”
- “Designed for expansion toward continuous ISL research.”

Avoid:

- “Works locally on every laptop.”
- “Understands all ISL or ASL.”
- “Sub-second on all hardware.”
- “100% accurate.”
- “Replaces interpreters.”
- “Enterprise compliant.”
- “Zero cloud” when Meet captions or a network endpoint are enabled.

## 12. Essential references

- [Google Gemma 4 architecture and memory requirements](https://ai.google.dev/gemma/docs/core)
- [Ollama Gemma 4 tags and package sizes](https://ollama.com/library/gemma4/tags)
- [Ollama chat API](https://docs.ollama.com/api/chat)
- [Ollama browser-extension origins and model keep-alive](https://docs.ollama.com/faq)
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome MV3 remotely hosted code restrictions](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
- [Google Meet caption privacy](https://support.google.com/meet/answer/10382037)

