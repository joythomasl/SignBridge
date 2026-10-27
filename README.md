# SignBridge AI

A Chrome extension prototype for Google Meet that displays interviewer captions and translates a limited set of candidate ASL signs into spoken English with Gemma 4.

## Current features

- Displays detected Meet captions both in the interviewer panel and in a large overlay at the bottom of the screen. Gemma 4 conservatively cleans finalized captions.
- Tracks both hands, upper-body pose and face landmarks locally with MediaPipe Holistic.
- Recognizes **250 isolated ASL words** with a local ONNX model from [GestureSign](https://github.com/shashank11yadav/GestureSign). Motion is segmented into complete signs; low-confidence results are rejected instead of guessed.
- Starts a segment when hands enter the frame, retains held handshapes, and requests at least 24 camera samples per second when the laptop can keep up. Alternative word guesses appear as correction buttons.
- Uses a separate ASL static alphabet model from [SignBridge](https://github.com/mhmdtaha091/SignBridge) for **24 held letters**. A 1.5-second hold is required; letters are suppressed while a word is being recognized. J and Z require motion and are available through manual correction, not automatic recognition.
- Accumulates accepted words, calls the configured **Gemma 4** model to form a short sentence from the signs alone, then speaks it through browser text-to-speech after the signer lowers their hands. No interviewer question is required.
- Sends the same response through Meet chat when the chat control is available. The user can correct glosses and review the generated answer.

The interviewer animation and the previous ISL runtime models have been removed from the extension package. The referenced [susilnem American-sign-Language project](https://github.com/susilnem/American-sign-Language) uses a CNN to group alphabet handshapes; it cannot replace the ASL word and motion model.

## Build and run

Requirements: Chrome, Node.js 20+, Ollama with Gemma 4.

```powershell
npm install
npm run build
ollama pull gemma4:e2b-it-q4_K_M
npm run ollama:serve
```

Load [dist](dist) via `chrome://extensions` → **Developer mode** → **Load unpacked**. Reload the extension there after each build, and refresh Meet. Turn Meet captions on and start the SignBridge camera.

The repository includes the ASL word model and MediaPipe Holistic model needed at runtime. See [setup](docs/SETUP.md) for the demo checklist.

## Accuracy and vocabulary limits

The word model's published held-out-signer top-1 accuracy is **72.1%** on its 250 isolated signs. This is not a continuous interpreter or a guarantee for a new webcam signer. Some classes have low individual accuracy; the extension requires at least 45% calibrated probability before accepting a word. Use the visible manual correction if a sign is uncertain.

The static ASL alphabet model supports A–I and K–Y. It classifies 282 of 288 bundled seed examples correctly, but those examples are not an independent evaluation set. J and Z are motion letters and are not inferred by a static hand classifier.

The supplied `MS-ASL.zip` contains class names, split annotations, and video URLs, **not video clips or hand landmarks**. It cannot train an additional word model without obtaining and processing the source clips. The 250-word model includes general vocabulary, but few technical interview terms. Gemma 4 must not invent missing facts from the question.

## Meet audio

Browser `speechSynthesis` plays through the laptop's speakers. Chrome does not expose it as a Meet microphone track, so remote participants are **not guaranteed to hear it**. Meet chat is the extension's automatic remote delivery path. The extension opens the in-call messages panel, locates the visible composer, and confirms that the draft clears after Send; if this fails, it leaves the draft and reports the reason. For remote audio, route system playback through a virtual microphone or loopback device and select that device in Meet.

## Sources and licenses

- [GestureSign](https://github.com/shashank11yadav/GestureSign): ASL isolated-sign model, feature extraction, segmentation, and local inference design. MIT license included at [assets/asl/GestureSign-LICENSE.txt](assets/asl/GestureSign-LICENSE.txt).
- [SignBridge ASL model](https://github.com/mhmdtaha091/SignBridge): 24 static letter weights and hand normalization. MIT license included at [assets/asl/ASL-SignBridge-LICENSE.txt](assets/asl/ASL-SignBridge-LICENSE.txt).
- [MediaPipe](https://github.com/google-ai-edge/mediapipe) Holistic runs locally in the extension.
