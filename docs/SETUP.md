# SignBridge AI setup

## Install

1. Install Node.js 20+, Chrome, and Ollama.
2. In the project directory, run:

```powershell
npm install
npm run build
ollama pull gemma4:e2b-it-q4_K_M
npm run ollama:serve
```

3. Keep the Ollama terminal open. In Chrome, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose this project's `dist` directory.
4. Open Google Meet, turn captions on, click **Start camera** in SignBridge, and allow camera access. **Check Gemma** should report that the configured model is ready.
5. After rebuilding, click **Reload** on the extension card and refresh the Meet tab.

The local ASL word, static alphabet, and MediaPipe Holistic models are included in the repository. The packaged extension needs no model download at runtime.

## Demo

1. Speak a question into Meet and confirm that the caption appears in the panel and bottom overlay. You can type the question if Meet captions are unavailable.
2. Sign one of the supported ASL words such as **HELLO**, **THANK YOU**, **YES**, **NO**, **THINK**, or **TIME**. Complete the motion and briefly pause; watch for the accepted word.
3. Lower your hands for at least two seconds. Gemma 4 renders the captured glosses into a short response, local TTS speaks it, and Meet chat receives the same text when available.
4. If a sign is uncertain, repeat it or use **Recognition and manual correction**. The 250-word model does not cover arbitrary interview vocabulary.

## Limitations and troubleshooting

- **No captions:** Meet captions must be on. Meet's DOM can change; type the question when capture fails.
- **Wrong word:** Keep your upper body and complete hands in frame, avoid a second person, and complete one sign before starting the next. The model may still make mistakes.
- **Letters:** Hold a static ASL handshape for 1.5 seconds. J and Z need motion and are manual-only.
- **No remote audio:** Browser TTS is local. Use Meet chat for remote text or configure a virtual microphone/loopback source in Meet for remote audio.
- **Gemma unavailable:** Confirm the model is installed and the Ollama launcher is running.
- **Slow laptop:** Close other camera or GPU-heavy applications. The local Holistic tracker and Gemma 4 both need substantial CPU and memory.

The supplied MS-ASL archive has annotations and video URLs only. Training new signs from it requires obtaining the source video clips and preparing labeled sequences.
