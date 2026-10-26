# SignBridge AI

A 24-hour hackathon prototype that adds a candidate-controlled, bidirectional ISL communication panel to Google Meet. MediaPipe performs local hand tracking, while Gemma 4 converts constrained glosses to concise English and maps interviewer questions to verified ISL phrase recordings.

## What works

- Recognize 44 bundled temporal word/phrase motions and all 35 `A–Z`/`1–9` classes with a trained landmark classifier.
- Automatically detect stabilized Meet questions, retain manual text as a fallback, and start visual translation without a button.
- Generate a constrained answer with local Gemma 4.
- Translate and speak signed phrases automatically after a 1.2-second signing pause.
- Keep a review-first mode with mandatory approval before manual speech or Meet chat insertion.
- Map supported questions to locally recorded, verified ISL phrase clips.
- Play 44 bundled dataset words/phrases as exact or explicitly approximate animations.
- Immediately fingerspell unsupported questions with 35 bundled alphanumeric signs while Gemma searches for a better phrase sequence.
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

Load the `dist` directory from `chrome://extensions` using **Load unpacked**, then open Google Meet. For transfer to another laptop, extract `signbridge-extension-0.3.1.zip` first and load the extracted folder.

See [setup](docs/SETUP.md), [measured benchmark](docs/BENCHMARK.md), [demo script](docs/DEMO_SCRIPT.md), and the [24-hour plan](HACKATHON_24H_PLAN.md).

## Expand the sign library

Import another labeled image-sequence ZIP at any time:

```powershell
npm run import:signs -- "C:\path\to\dataset.zip"
npm run build
```

The importer accepts `label/frame.png` or `label/frame.jpg`, including a ZIP nested inside another ZIP. It compresses the frames and regenerates `assets/signs/library.json`. See [sign dataset guide](docs/SIGN_DATASETS.md).

## Live sign-to-audio

Live mode is always enabled. SignBridge continuously accumulates recognized glosses; after a short neutral pause, Gemma 4 renders the phrase and browser TTS speaks it automatically. The extension then clears only the processed glosses and continues listening. Meet questions automatically start exact phrase, word-sequence, or fingerspelling animation. Automatic chat sending remains disabled.

Static letters pass through a motion gate before classification, so intermediate hand shapes are ignored while the signer changes poses. A settled pose is then held for confirmation. Temporal words use a stricter sequence, margin, and expected-motion check, and live speech waits two seconds after the last accepted sign.

The camera label distinguishes **No hand** from **Hand tracked · unknown sign**. Built-in temporal recognition covers the 44 supplied everyday words and phrases. A multinomial landmark classifier covers all 35 alphabet/digit labels and rejects low-confidence or ambiguous poses. It was trained on 4,120 MediaPipe-detected samples and reached 99.78% on a held-out split from the supplied dataset. Because that split is from the same source dataset, it does not measure signer-independent accuracy. The word dataset also contains approximately one recorded sequence per label, so performance across different signers and camera angles remains experimental.

## Important limitation

This is a limited-vocabulary prototype, not a continuous ISL interpreter. Bundled dataset clips are labelled for review because their linguistic accuracy and redistribution license have not been independently verified. Signer-verified custom recordings take priority.
