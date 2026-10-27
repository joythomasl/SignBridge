# SignBridge AI setup

1. Install Node.js 20+, Chrome, and Ollama. Run `npm install` and `npm run build` in the project directory.
2. Run `ollama pull gemma4:e2b-it-q4_K_M`, then `npm run ollama:serve`. Keep the Ollama terminal open.
3. In Chrome, open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select this project's `dist` directory.
4. Open Meet and allow the SignBridge camera prompt. The extension starts its camera and tries to turn on Meet captions automatically. If Meet's caption control has changed, turn captions on yourself. Check Gemma should report that the configured model is ready.
5. After rebuilding, click Reload on the extension card and refresh Meet.

## Demo

Keep your face, shoulders, and signing hand in frame. Fingerspell **H E L L O**, pausing or briefly releasing between repeated letters. The sequence model processes the full segment after you lower your hand for about 0.7 seconds. Segments shorter than 15 frames are ignored. A confident result is spoken automatically and sent to Meet chat. There is no Speak button or approval step.

## Troubleshooting

- The sequence model is the only automatic recognizer. Short or uncertain clips are not spoken; add or correct letters with the manual controls when needed.
- Keep the entire signing hand in frame, use even lighting, and avoid another hand crossing the camera.
- If letters are wrong, use Backspace and the manual A–Z selector. This prototype has no signer-independent accuracy guarantee.
- If captions are absent, enable Meet captions; type the question manually if Meet's interface changes. The extension reads Meet's rendered caption container, so Meet must have captions available for your language and account.
- If Meet chat delivery fails, use Insert in Meet chat and inspect the status. Local speech does not automatically reach remote audio.
- On a slow laptop, close other camera or GPU-heavy applications. The hand tracker is lighter than the former Holistic plus word-model pipeline.
