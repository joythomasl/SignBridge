# SignBridge AI

A Chrome extension prototype for Google Meet. It displays interviewer captions and converts candidate ASL fingerspelling into local speech and Meet chat text. Gemma 4 may add casing or punctuation to the completed spelling; the extension rejects its output if the letter sequence changes.

## Current flow

- MediaPipe Holistic tracks hands, face, and pose on the laptop. The bundled **first-place Kaggle ASL fingerspelling TFLite model** decodes a completed landmark sequence into letters. It runs locally in a sandboxed extension iframe through a bundled WASM runtime.
- The first-place sequence model is the only automatic letter recognizer. The separate heuristic alphabet preview has been removed so an unrelated handshape guess cannot override the sequence model. Manual A–Z correction, Space, Backspace, and Clear remain available.
- The extension records the full pose and landmark sequence while a hand is visible. Lower the hand for about 0.7 seconds to end a segment. Segments shorter than the framework's 15-frame minimum are discarded; segments over 384 frames are resampled to the model maximum. Uncertain results are withheld from speech. There is no isolated word-class prediction.
- If a result is withheld, the status reports the model's suggestion, confidence, frame count, and valid hand/face/pose coordinate coverage to help diagnose capture failures.
- Meet captions are switched on automatically when the extension finds the control. Captions appear in the extension and as a bottom overlay. Candidate spelling does not depend on the interviewer question.

## Build and run

Requires Chrome and Node.js 20+. Ollama with Gemma 4 supplies optional spelling punctuation.

```powershell
npm install
npm run build
ollama pull gemma4:e2b-it-q4_K_M
npm run ollama:serve
```

Load [`dist`](dist) using `chrome://extensions` → Developer mode → Load unpacked. Reload the extension after rebuilding and refresh the Meet tab. The camera and Meet captions start automatically where available; allow Chrome camera access when prompted. See [setup](docs/SETUP.md).

## Model provenance and limits

The [first-place Kaggle ASL fingerspelling solution](https://github.com/ChristofHenkel/kaggle-asl-fingerspelling-1st-place-solution) supplies the sequence architecture and its [v0.0.1-alpha release](https://github.com/ChristofHenkel/kaggle-asl-fingerspelling-1st-place-solution/releases/tag/v0.0.1-alpha) supplies the TFLite weights. The bundled 40,946,288-byte model matches SHA-256 `4dda856e82c4f909c3ae7eb7f070e5fc88afb143daab639683209b631e3cbfaa`. The browser TFLite wrapper has no dynamic input resize, so this integration reloads the verified model with each segment's actual frame count, capped at 384 frames. This adds latency when the frame count changes. The Apache 2.0 license is included in [`assets/asl/Kaggle-ASL-LICENSE.txt`](assets/asl/Kaggle-ASL-LICENSE.txt).

The project no longer uses a separate static alphabet model for automatic predictions. **Accuracy across users, lighting, cameras, and signing styles has not been established.** The recognizer may abstain or misclassify; use the visible correction controls.

## Meet audio

Chrome text to speech plays automatically through the laptop speakers. Chrome does not expose it as a Meet microphone track, so remote participants are not guaranteed to hear it. Meet chat is the automatic remote text path. For remote audio, route system playback through a virtual microphone or loopback device and select that device in Meet.
