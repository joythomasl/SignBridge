# SignBridge AI

A Chrome extension prototype for Google Meet. It displays interviewer captions and converts candidate ASL fingerspelling into local speech and Meet chat text. Gemma 4 may add casing or punctuation to the completed spelling; the extension rejects its output if the letter sequence changes.

## Current flow

- MediaPipe Holistic tracks hands, face, and pose on the laptop. The bundled **first-place Kaggle ASL fingerspelling TFLite model** decodes a completed landmark sequence into letters. It runs locally in a sandboxed extension iframe through a bundled WASM runtime.
- A separate handshape model previews the 24 static ASL letters A–I and K–Y during signing. J and Z also have traced motion checks. The full A–Z alphabet is available with manual letter correction, Space, Backspace, and Clear.
- Preview letters are visual hints only. The sequence model alone produces automatic text; uncertain results are withheld from speech. Lower the hand for about 0.7 seconds to end a spelling segment. A confident result speaks automatically through Chrome text to speech and is sent to Meet chat. There is no isolated word-class prediction.
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

The bundled [SignBridge static alphabet model](https://github.com/mhmdtaha091/SignBridge) is MIT licensed; its license is included in [`assets/asl/ASL-SignBridge-LICENSE.txt`](assets/asl/ASL-SignBridge-LICENSE.txt). It labels 282 of 288 supplied seed examples correctly, but those examples are not a signer-independent validation set. J/Z preview paths are geometric checks. **Perfect accuracy across users, lighting, cameras, and signing styles has not been established.** The recognizer may abstain or misclassify; use the visible correction controls.

## Meet audio

Chrome text to speech plays automatically through the laptop speakers. Chrome does not expose it as a Meet microphone track, so remote participants are not guaranteed to hear it. Meet chat is the automatic remote text path. For remote audio, route system playback through a virtual microphone or loopback device and select that device in Meet.
