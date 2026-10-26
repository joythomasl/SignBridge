# SignBridge AI — Feasibility, Limitations, Bottlenecks, and Delivery Plan

**Assessment date:** 26 October 2026  
**Project state:** Concept documentation only. The workspace contains no source code, package manifest, tests, model assets, or Git repository.

## 1. Executive decision

SignBridge is feasible as a **narrow, human-confirmed accessibility prototype**. It is not yet supportable as an “autonomous, bidirectional sign-language interpreter,” and the supplied performance, privacy, accuracy, and compliance claims are not demonstrated.

The safest achievable first product is:

- ISL only, not “ISL / ASL.”
- A limited, explicitly published vocabulary of isolated signs or short domain phrases.
- Local candidate-video processing and local language generation.
- A mandatory preview/edit/confirm step before speech or chat output.
- Interviewer speech delivered as text captions first; sign clips are supplementary visual aids until validated by native ISL users.
- A local speech recognizer fed from user-authorized tab audio if strict zero-cloud operation is required.

Do **not** market the first version as autonomous interpretation, continuous ISL translation, sub-second on every laptop, zero-cost, or enterprise-compliant.

## 2. Claim audit

| Claim in the concept | Finding | Required correction or proof |
|---|---|---|
| `gemma4:e4b` exists and is suitable for laptops | **Plausible, but hardware-dependent.** Ollama currently lists E4B quantizations around 6.1–9 GB. | Pin an exact tag and hash. Benchmark cold load, prompt evaluation, generation, RAM/VRAM, thermals, and contention with Meet on every supported hardware tier. |
| “100% local” | **False with the documented STT paths.** Web Speech recognition is server-backed by default. Meet captions temporarily send audio to Google transcription servers. | Use a verified on-device language pack or, preferably, `tabCapture` + a bundled/local STT service. State clearly when Meet captions are used as a cloud-assisted fallback. |
| `webkitSpeechRecognition` captures the interviewer | **Architecture gap.** The API starts recognition from the device microphone; the standardized API does not accept an arbitrary tab `MediaStream`. | Capture the Meet tab after an explicit user gesture and send PCM frames to a local STT engine, or use Meet captions with an explicit privacy tradeoff. |
| MediaPipe Hands + cosine similarity translates signing | **Only for a small isolated-gesture vocabulary.** Hand landmarks alone omit face, torso, signing space, temporal motion, co-articulation, and discourse reference. | Reframe as “limited sign-command recognition,” or build and validate a temporal ISL model using hands, body, face, and motion. |
| A single 320×240 JPEG supplies facial grammar | **Not credible.** One end-frame cannot preserve motion or non-manual markers spanning an utterance; 320×240 may also lose finger and facial detail. | Retain a short temporal feature window and evaluate resolution empirically. Use MediaPipe Face/Pose or a trained video encoder where consent permits. |
| The feature vector is invariant | **Incomplete.** Wrist translation and palm-size scaling do not give full view, rotation, handedness, or articulation invariance. The stated 60 dimensions also describe one hand only. | Add handedness handling, canonical rotation, two-hand representation, missing-landmark logic, temporal features, calibration, and an unknown class. |
| 60 FPS tracking | **Unproven end-to-end.** MediaPipe publishes low per-frame landmark latency on reference devices, but camera FPS, Meet/WebRTC, canvas work, thermals, and the VLM compete for resources. | Set an adaptive target (for example, 15–30 FPS) and measure dropped frames and call quality under simultaneous load. |
| An 800 ms hold/debounce identifies signs | **Conflicts with natural signing.** Dynamic signs may never remain static for 800 ms, while transitions may produce false matches. | Use temporal segmentation, velocity, start/end detection, and sequence models. Keep hold-to-select only for the constrained demo mode. |
| Gemma expands sparse glosses into professional answers | **High-risk semantic fabrication.** The examples introduce facts never signed, such as “end-to-end pipelines” and “moving inference to the local edge.” | The generator must preserve only expressed propositions. Ask for clarification or emit a literal short answer when information is missing. Require candidate confirmation. |
| Omitting `<|think|>` guarantees 350–650 ms | **Unsupported.** Disabling thinking reduces output work but does not guarantee model load, image encoding, prompt evaluation, queueing, or speech latency. | Use Ollama's supported `think: false`; publish measured p50/p95 latency on named hardware, with warm and cold starts separated. |
| TTS is heard by the interviewer | **Not by default.** `speechSynthesis` plays to local system output; Meet transmits the selected microphone input. | Require a configured virtual audio device or a desktop companion that exposes a virtual microphone. Provide an echo/feedback test. |
| Meet chat injection is reliable and creates a permanent transcript | **Brittle and privacy-sensitive.** Meet has no stable extension API for its internal chat DOM; selectors and accessible labels can change. Chat data also leaves the machine. | Put all selectors behind a versioned adapter, detect failures, never auto-send without confirmation, and do not describe chat as local/private. |
| “ISL / ASL gloss grammar” | **Invalid scope.** ISL and ASL are different natural languages, not interchangeable token orders. | Select one language for the product and dataset. This plan assumes ISL. |
| Sign cards or a 3D avatar provide ISL output | **Not established.** Sequential word cards omit movement, placement, co-articulation, facial grammar, and regional variants. | Treat cards as vocabulary aids only. For sign output, use native-signer recordings first. Avatar production is a research workstream requiring linguistic evaluation. |
| Fine-tuning Gemma on INCLUDE enables 2,000+ signs | **Wrong dataset/model assumption.** INCLUDE is an isolated-sign recognition dataset. LLM LoRA alone does not create a temporal visual recognizer or continuous translator. | Start with INCLUDE for isolated-word experiments. Evaluate iSign/ISLTranslate for sentence-level research and check every dataset's license and signer splits. |
| “Complete enterprise compliance” | **Cannot be claimed from local inference alone.** Consent, retention, logs, extension permissions, model licensing, security review, accessibility testing, and employer policy all matter. | Produce a threat model, data-flow diagram, retention policy, consent UI, SBOM, privacy notice, and organization-specific review. |
| ₹0/free forever | **Misleading.** It excludes laptop/GPU requirements, power, setup, maintenance, validation, and support. | Say “no per-call model API fee in local mode.” Track total cost of ownership separately. |

## 3. Highest-priority bottlenecks

### P0 — Must be resolved before claiming an MVP

1. **Meaning preservation and user agency**
   - The model currently has permission to invent a polished answer from a few signs.
   - In an interview, an invented skill, duration, technology, or achievement can materially harm the candidate.
   - Required controls: constrained structured meaning, visible confidence, preview/edit, explicit Speak/Send, Cancel, and an audit trail kept locally only if the user opts in.

2. **Sign recognition scope**
   - Template matching is appropriate for a command interface, not continuous natural ISL.
   - Dynamic two-handed signs, occlusion, signer variation, left/right mirroring, facial grammar, transition movements, and regional variation are unsolved by the proposed matcher.
   - A real translator requires temporal modeling and signer-independent evaluation.

3. **Remote speech acquisition and privacy**
   - Browser speech recognition does not solve tab-audio ingestion, and its default service is not local.
   - Meet-caption scraping is useful for a demo but contradicts the zero-cloud claim.
   - Strict-local mode needs user-initiated `chrome.tabCapture`, audio resampling, local VAD, and local STT.

4. **Output routing**
   - Browser TTS does not automatically enter Meet's outgoing microphone stream.
   - A virtual audio cable adds installation, device selection, permissions, feedback, and support burden. It also makes “Chrome extension only” inaccurate.

5. **Language and accessibility validation**
   - No native ISL signer, Deaf product reviewer, or certified interpreter is identified in the project.
   - The World Federation of the Deaf recommends that sign-language work be led by native Deaf sign-language users and reflect regional variation.

### P1 — Major engineering and release risks

6. **Hardware and latency variability**
   - The current machine has 15.2 GB RAM and an NVIDIA RTX 3050 Laptop GPU. Windows reported 4 GB through the queried adapter interface, while the product name commonly denotes a 6 GB configuration; this must be confirmed with GPU tooling.
   - Ollama is not installed or is not on `PATH`.
   - A 6.1–6.6 GB E4B quantization is unlikely to fit wholly in 4–6 GB VRAM alongside Chrome/Meet, so partial CPU offload and latency spikes are likely.

7. **Resource contention with Meet**
   - Webcam decoding, WebRTC encode/decode, background effects, MediaPipe, local STT, VLM inference, and TTS all contend for CPU/GPU/memory bandwidth.
   - The system can reduce call quality, drop frames, overheat, or drain a laptop battery even if each component works alone.

8. **Google Meet DOM volatility**
   - Caption and chat scraping relies on undocumented implementation details.
   - Selectors must use semantic fallbacks, MutationObservers, feature detection, telemetry without content, and graceful degradation.

9. **Manifest V3 packaging**
   - MediaPipe JavaScript/WASM must be bundled; Chrome Web Store policy disallows remotely hosted executable code.
   - Ollama requires the extension origin to be allowed with `OLLAMA_ORIGINS`; allowing every extension origin increases local attack surface. Prefer the exact extension ID or a locked-down local companion.

10. **Model startup and lifecycle**
    - Ollama unloads idle models by default and cold starts can dominate response time.
    - Preload on explicit user action, use a bounded keep-alive, expose readiness, and never promise a response until the health check passes.

11. **Speaker boundaries and turn-taking**
    - The design stores only the “last question,” but interviews contain interruptions, follow-ups, code discussion, multiple speakers, and long questions.
    - Add VAD, utterance finalization, speaker labels where available, a manual “use this question” control, and correction history.

### P2 — Pilot and production blockers

12. **Dataset licensing, coverage, and leakage**
    - Validate commercial/research usage rights, redistribution, consent, demographics, regional coverage, signer-independent splits, and overlap between train/test signers.

13. **Evaluation gap**
    - No golden set, unseen-signer cohort, noisy-call corpus, or semantic-faithfulness rubric exists.
    - Accuracy on isolated dictionary videos is not evidence of interview performance.

14. **Security and compliance**
    - Localhost has no automatic trust boundary. Any allowed web/extension origin may probe an unauthenticated local service if configuration is broad.
    - Add origin restriction, input limits, timeouts, request cancellation, prompt-injection-resistant structured schemas, local log redaction, dependency scanning, and signed releases.

15. **Consent and employment fairness**
    - Both parties need to know when AI is translating, speaking, or posting to chat.
    - Establish who may correct the transcript, whether outputs are retained, and how errors are contested. Do not position generated fluency as the candidate's exact wording without confirmation.

16. **Support burden**
    - Camera/mic permissions, language packs, GPU drivers, model downloads, virtual audio devices, corporate browser policies, and endpoint protection can all block setup.
    - A preflight wizard and supported-device matrix are product requirements, not optional polish.

## 4. Revised architecture

```text
User gesture
   |
   +--> Meet tab audio capture --> local PCM/VAD --> local STT ----+
   |                                                              |
   |                                                        Question text
   |                                                              |
Camera --> hand + pose + face features --> temporal ISL model --> structured meaning
                                                                   |
                                      constrained language renderer (no new facts)
                                                                   |
                                      candidate preview/edit/confirm
                                           |                 |
                                      local TTS          Meet chat adapter
                                           |                 |
                               selected virtual mic      explicit Send only
```

Recommended component boundaries:

- **Content script:** overlay UI and DOM adapters only.
- **Extension service worker/offscreen document:** lifecycle, tab capture, audio worklet, and message routing.
- **Local companion service:** STT, optional temporal sign model, Gemma/Ollama proxy, health checks, authentication token, resource scheduling, and redacted metrics.
- **Recognition engine:** temporal feature windows; hand + pose + face; signer calibration; known/unknown classification; no LLM guessing.
- **Language renderer:** schema-constrained input and output; preserves propositions; prohibits adding employers, years, tools, results, or causality not present in the structured meaning.
- **Output layer:** local subtitle always; speech and chat only after confirmation.

## 5. Delivery plan and gates

Durations assume a small team with one extension engineer, one ML engineer, one product/accessibility lead, and regular participation from native ISL users. A solo implementation will take longer.

### Phase 0 — Product and ethics definition (1 week)

Deliverables:

- Choose ISL as the sole first language and define supported regions/variants.
- Recruit at least 3 paid native ISL reviewers and one qualified linguistic/interpreting advisor.
- Define the first interview domain and a 25–50 item vocabulary.
- Write consent, disclosure, retention, correction, and failure-mode requirements.
- Replace “autonomous interpreter” language with an accurate prototype description.

Gate: No implementation claim is accepted until native signers approve the interaction model and terminology.

### Phase 1 — Feasibility spikes (1–2 weeks)

Build disposable experiments, not the UI:

1. Benchmark pinned Gemma 4 E4B quantizations on the minimum and target laptop while Meet is active.
2. Prove authorized tab-audio capture, 16 kHz mono conversion, local VAD, and local STT.
3. Prove TTS-to-Meet routing on Windows and document echo/feedback behavior.
4. Collect consented samples for 10 signs from at least 5 people not present in template/training data.
5. Compare cosine templates against a small temporal classifier with an explicit unknown class.
6. Test chat and caption DOM adapters in multiple Meet layouts/accounts.

Go/no-go criteria:

- Warm end-of-utterance to first visible text p95 <= 1.5 seconds on target hardware.
- Meet call remains usable: no sustained audio breakup and no material video degradation in a 30-minute soak test.
- Local STT word error rate <= 20% on a representative quiet interview-call set.
- The sign spike rejects unknown/transition gestures at least 90% of the time and reaches macro-F1 >= 0.85 on unseen signers for the tiny test vocabulary.
- TTS routing works without acoustic loopback.

If a gate fails, reduce scope before proceeding; do not hide the failure behind the LLM.

### Phase 2 — Safe constrained prototype (2–3 weeks)

Deliverables:

- MV3 extension with bundled executable assets and least-privilege permissions.
- Setup/preflight screen for camera, tab audio, local service, model, and output device.
- 25–50 isolated signs/short phrases with visible confidence and unknown state.
- Start/stop signing control instead of implicit autonomous turn-taking.
- Structured meaning record and constrained English renderer.
- Preview, edit, Speak, Send, Cancel, and Undo-before-send interactions.
- Captions and a local session history that is off by default and clearable.
- Adapter tests using saved, non-sensitive DOM fixtures.

Gate: Zero fabricated facts across the semantic safety test set; at least 90% of reviewed outputs rated meaning-preserving by native ISL reviewers; all external transmissions disclosed in the UI.

### Phase 3 — Research MVP (6–10 weeks)

Deliverables:

- Temporal multi-modal recognition model using motion, hands, upper body, and non-manual features.
- Signer-independent training and evaluation split.
- A vocabulary and phrase set derived from real interview research, not developer intuition.
- Native-signer video clips for reverse communication; clips are explicitly supplementary to captions.
- Confidence calibration, abstention, correction learning kept local, and per-class error reports.
- Performance scheduler that reduces feature FPS or suspends VLM image input when call quality falls.

Gate: Complete a scripted interview task set with at least 10 unseen signers; publish recognition, semantic, latency, correction-rate, and task-success results together, including failures.

### Phase 4 — Controlled pilot (2–3 months)

Deliverables:

- 20–30 consented interviews in a non-evaluative or mock-interview setting first.
- Threat model, privacy notice, SBOM, model/dataset license register, and retention controls.
- Signed installer/local companion, scoped authentication, auto-update plan, and rollback.
- Support matrix covering OS, Chrome, GPU/RAM, audio routing, corporate policy, and CSE meetings.
- Incident process for mistranslation, bias, data exposure, and interview disruption.

Gate: Deaf participants independently report that the system improves task completion without unacceptable loss of agency. Security and accessibility reviewers approve the pilot scope. Production claims remain limited to the evaluated vocabulary, environment, language variant, and hardware.

## 6. Hackathon-safe scope

If the goal is a short demo rather than a validated product, demonstrate only this:

- 10–20 pre-tested ISL signs or intent buttons.
- A visible gloss/meaning buffer.
- One pinned local model on one named laptop.
- Candidate review/edit before speech.
- Local subtitle plus virtual-cable TTS that has been preconfigured and tested.
- Interviewer text obtained either from typed input, explicitly cloud-assisted Meet captions, or a proven local STT spike.
- Pre-recorded native-signer clips for a few reverse-direction phrases, labeled as phrase clips rather than generated ISL.

State the limitations on the demo slide. Do not demonstrate unscripted continuous signing unless it has actually passed unseen-signer testing.

## 7. Test and measurement plan

| Area | Required metrics |
|---|---|
| Sign recognition | Per-class precision/recall/F1, macro-F1, unknown rejection, transition false-positive rate, signer-independent results, lighting/view/distance slices |
| Meaning | Proposition precision/recall, additions not present in source, omissions, number/name/negation accuracy, native-signer rating, correction rate |
| STT | WER by accent/noise/speaker, endpoint delay, interruption handling, question-boundary accuracy |
| Latency | Cold and warm p50/p95/p99 for capture, recognition, VLM, first token, final text, TTS start, and chat insertion |
| System health | CPU, GPU, VRAM/RAM, dropped frames, WebRTC audio concealment/jitter indicators where available, temperature, battery draw, crash rate |
| Accessibility | Task completion, time, visual attention switching, fatigue, edit burden, perceived control, preference versus captions/interpreter |
| Reliability | 30/60-minute soak tests, model/service restart, permission denial, DOM changes, device changes, offline mode |
| Security/privacy | Network egress audit, origin checks, prompt/content log audit, dependency scan, permission review, local API abuse tests |

Every benchmark report must name the model tag/hash, quantization, Ollama version, browser version, OS, CPU, GPU/VRAM, RAM, power mode, call configuration, vocabulary, signer split, and sample count.

## 8. Immediate backlog

1. Initialize Git and a minimal project structure.
2. Replace the original claims table with the audited wording above.
3. Decide strict-local versus cloud-assisted STT; do not mix the two under one privacy claim.
4. Pin the exact Gemma model and install/benchmark Ollama on the target machine.
5. Recruit native ISL collaborators before choosing signs or gloss grammar.
6. Define the initial 25–50-item vocabulary and an explicit unsupported/unknown behavior.
7. Build four isolated spikes: tab audio/STT, TTS routing, temporal sign recognition, Meet DOM adapter.
8. Create an evaluation corpus and test harness before integrating the HUD.
9. Only then integrate the safe prototype and run a 30-minute end-to-end soak test.

## 9. Decisions the project owner must make

- Is the first deliverable a judged hackathon demo, a research prototype, or a product pilot?
- Is strict zero-cloud operation mandatory? If yes, Meet captions and default Web Speech recognition are excluded.
- Is a desktop companion/virtual audio driver acceptable, or must the product remain extension-only?
- What is the minimum supported laptop specification?
- Which ISL region/community and interview domain define the first vocabulary?
- Who are the native ISL co-designers and evaluators?
- Is chat posting required, given that it sends generated content to Google and creates organizational retention concerns?
- What error rate and delay are acceptable before the system must abstain?

## 10. Primary references

- [Gemma model families and intended platforms](https://ai.google.dev/gemma/docs/get_started)
- [Ollama Gemma 4 model tags and sizes](https://ollama.com/library/gemma4/tags)
- [Ollama chat API, including `think` and timing fields](https://docs.ollama.com/api/chat)
- [Ollama FAQ: local data, CORS origins, keep-alive, queueing, and memory behavior](https://docs.ollama.com/faq)
- [Chrome tab audio/screen capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)
- [Chrome content-script isolation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome MV3 remotely hosted code restrictions](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [Web Speech API behavior and on-device option](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [Google Meet privacy: captions send audio temporarily to Google transcription servers](https://support.google.com/meet/answer/10382037)
- [Google Meet client-side encryption limitations](https://support.google.com/meet/answer/11605714)
- [MediaPipe Hand Landmarker outputs and reference latency](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)
- [AI4Bharat INCLUDE: isolated ISL recognition dataset](https://github.com/AI4Bharat/sign-language.ai4bharat.org/blob/master/docs/INCLUDE.md)
- [iSign benchmark and ISL-English data](https://aclanthology.org/2024.findings-acl.643/)
- [Linguistic requirements for sign-language processing](https://aclanthology.org/2021.acl-long.570/)
- [World Federation of the Deaf statement on variation and native Deaf leadership](https://wfdeaf.org/wfd-statement-on-standardized-sign-language/)

