# SignBridge AI

A 24-hour hackathon prototype that adds a candidate-controlled, bidirectional ISL communication panel to Google Meet. MediaPipe performs local hand tracking, while Gemma 4 cleans finalized captions, converts constrained glosses to concise English, and maps interviewer questions to the available ISL vocabulary.

## What works

- Recognize 44 bundled temporal word/phrase motions using speed-tolerant dynamic time warping, plus all 35 `A–Z`/`1–9` classes with a nonlinear landmark MLP.
- Train a personal 3-second motion sample for any word that does not generalize to the current signer.
- Automatically detect stabilized Meet questions, refine punctuation conservatively with Gemma 4, and show a large bottom-screen caption.
- Generate a constrained answer with local Gemma 4.
- Translate and speak completed signed phrases after the signer lowers their hands; keep collecting while either hand remains visible.
- Keep a review-first mode with mandatory approval before manual speech or Meet chat insertion.
- Map supported questions to locally recorded, verified ISL phrase clips.
- Generate a smooth two-hand signing avatar from all 21 landmarks per hand; the runtime package contains no dataset photographs.
- Immediately animate unsupported questions with 35 generated alphanumeric poses while Gemma searches for a better word sequence.
- Store gesture templates and phrase clips in local browser storage.

## Quick start

```powershell
npm install
npm run build
ollama pull gemma4:e2b-it-q4_K_M
npm run ollama:serve
```

Keep that Ollama terminal open. In a second terminal, verify the model and extension:

```powershell
npm run smoke:ollama
npm run smoke:browser
```

Load the `dist` directory from `chrome://extensions` using **Load unpacked**, then open Google Meet. For transfer to another laptop, extract `signbridge-extension-0.4.0.zip` first and load the extracted folder.

See [setup](docs/SETUP.md), [measured benchmark](docs/BENCHMARK.md), [demo script](docs/DEMO_SCRIPT.md), and the [24-hour plan](HACKATHON_24H_PLAN.md).

## Expand the sign library

Import another labeled image-sequence ZIP at any time:

```powershell
npm run import:signs -- "C:\path\to\dataset.zip"
npm run build
```

The importer accepts `label/frame.png` or `label/frame.jpg`, including a ZIP nested inside another ZIP. It compresses the frames and regenerates `assets/signs/library.json`. See [sign dataset guide](docs/SIGN_DATASETS.md).

## Live sign-to-audio

Live mode is always enabled. SignBridge continuously accumulates recognized glosses while hands remain visible. After the signer lowers both hands, Gemma 4 renders the completed phrase, browser TTS speaks it, and SignBridge sends the same text through Meet chat when the chat control is available. The extension then clears only the processed glosses and continues listening. Meet questions automatically start a word-sequence or fingerspelling avatar animation.

Static letters pass through a motion gate before classification, so intermediate hand shapes are ignored while the signer changes poses. A settled pose is then held for confirmation. Temporal words use a stricter sequence, margin, and expected-motion check, and live speech waits two seconds after the last accepted sign.

The camera label distinguishes **No hand** from **Hand tracked · unknown sign**. Built-in temporal recognition covers the 44 supplied everyday words and phrases. A `134 → 128 → 64 → 35` landmark MLP covers all alphabet/digit labels and rejects low-confidence, ambiguous, or out-of-distribution poses. It was trained on 4,120 MediaPipe-detected samples and reached 99.89% on a held-out split from the supplied dataset. Because that split is from the same source dataset, it does not measure signer-independent accuracy. Personal motion training is provided because the word dataset contains approximately one recorded sequence per label.

Chrome does not expose `speechSynthesis` audio as a microphone track. Therefore local TTS cannot be guaranteed to enter a remote Meet participant's audio on every laptop. Meet chat is the reliable automatic remote delivery path; remote audio additionally requires a loopback/virtual microphone selected in Meet.

## Important limitation

This is a limited-vocabulary prototype, not a continuous ISL interpreter. Bundled dataset clips are labelled for review because their linguistic accuracy and redistribution license have not been independently verified. Signer-verified custom recordings take priority.

## Design references

The recognition update follows established open-source patterns without copying their trained models: [MediaPipe keypoint + point-history classification](https://github.com/kinivi/hand-gesture-recognition-mediapipe), [two-hand ISL MLP normalization and commit states](https://github.com/nitibudania/real-time-isl-recognition), and [local Meet caption capture with revision handling](https://github.com/vincelamm/gMeetTranscriptCapture). SignBridge keeps its own ISL dataset, browser-native model format, dynamic-time-warped word matcher, generated avatar, and Gemma 4 language layer.
