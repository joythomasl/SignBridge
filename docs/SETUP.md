# SignBridge AI setup

1. Install Node.js 20+, Chrome, and Ollama. Run `npm install` and `npm run build` in the project directory.
2. Run `ollama pull gemma4:e2b-it-q4_K_M`, then `npm run ollama:serve`. Keep the Ollama terminal open.
3. In Chrome, open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select this project's `dist` directory.
4. Open Meet, turn captions on, click Start camera in SignBridge, and allow camera access. Check Gemma should report that the configured model is ready.
5. After rebuilding, click Reload on the extension card and refresh Meet.

## Demo

Hold an ASL letter until it appears as a preview, then change to the next handshape. The previous letter is committed on the transition. For the last letter, lower your hand briefly. Spell **H E L L O**; repeat the second L by briefly releasing or resetting your hand. The first-place sequence model then checks the completed spelling. Use the Space button between words. Trace J with the pinky and Z with the index finger. After lowering your hand for about two seconds, the extension speaks the spelled text locally and attempts Meet chat delivery.

## Troubleshooting

- The sequence model covers A–Z. The live preview model covers 24 static handshapes; J and Z need a visible motion path and may require manual correction.
- Keep the entire signing hand in frame, use even lighting, and avoid another hand crossing the camera.
- If letters are wrong, use Backspace and the manual A–Z selector. This prototype has no signer-independent accuracy guarantee.
- If captions are absent, enable Meet captions; type the question manually if Meet's interface changes.
- If Meet chat delivery fails, use Insert in Meet chat and inspect the status. Local speech does not automatically reach remote audio.
- On a slow laptop, close other camera or GPU-heavy applications. The hand tracker is lighter than the former Holistic plus word-model pipeline.
