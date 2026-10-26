# SignBridge AI setup

## Build the extension

Requirements: Node.js 20+ and Google Chrome.

```powershell
npm install
New-Item -ItemType Directory -Force vendor | Out-Null
curl.exe -L "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -o "vendor/hand_landmarker.task"
npm run build
```

Load the unpacked extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose the absolute `dist` directory from this project.
5. Open Google Meet and allow camera access when SignBridge asks.

## Configure local Gemma 4

Install Ollama, then run:

```powershell
ollama pull gemma4:e2b-it-q4_K_M
npm run ollama:serve
```

Keep this terminal open during the demo. The launcher permits extension requests for the current process and starts the default SignBridge endpoint at `http://localhost:11434`.

If another Ollama process already owns port 11434, quit Ollama from the Windows tray before running the launcher. To persist the origin rule for later sessions, use:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*", "User")
```

Allowing all Chrome extensions is suitable only for the hackathon demo. After the extension ID is stable, replace the wildcard with its exact origin.

## Prepare the demo

1. Open a Meet call and turn captions on.
2. Speak a question such as “How are you?” and confirm its caption automatically starts the animation.
3. Open **ISL phrase clip studio** and record signer-verified replacements for the five interview intents where possible.
4. Start the SignBridge camera.
5. Test several bundled temporal words such as `TEAM`, `STOP`, `PROBLEM`, or `UNDERSTAND`, plus several fingerspelling poses. For an unreliable letter, select it and hold the pose during training. For an unreliable word, select it and perform its full motion once during the 3-second training window.
6. Select **Check Gemma** and verify the green ready status.
7. Sign the demo phrase and confirm it is spoken automatically after the short neutral pause.
8. Rehearse both automatic directions three times.

The recorded phrase clips and gesture templates remain in local browser storage. They are not included in the source tree.

The build includes 44 landmark-motion labels and 35 alphanumeric poses. Interviewer-side output is rendered by the generated landmark avatar; source photographs are excluded from `dist`. Assembled word sequences and fingerspelling remain explicitly labelled approximate. See `docs/SIGN_DATASETS.md` to replace or expand them.

## Network mode

For a low-spec laptop, set the endpoint to an HTTPS Ollama-compatible Gemma 4 gateway and provide its API key if required. This is not local mode and must be disclosed during the demo.

## Troubleshooting

- **No captions captured:** Turn Meet captions on, wait for a finalized line, or type/paste the question manually. Captured questions appear in the bottom-screen overlay.
- **No chat field found:** Open Meet's chat panel, retry, or use Copy.
- **Model missing:** Run the `ollama pull` command above.
- **Slow inference:** Close other GPU-heavy apps, keep the model warm, and keep prompts text-only.
- **Gesture repeats:** Hold the sign once, then return to a neutral pose during the cooldown.
- **Transition interpreted as a sign:** Wait until the camera label changes from **Hand moving** to a stable letter. Do not pause midway between two poses.
- **Remote participant cannot hear TTS:** Open Meet chat for automatic text delivery. For remote audio, select a system loopback/virtual microphone in Meet; Chrome cannot route browser `speechSynthesis` directly into Meet's microphone track.
- **Wrong gesture:** Face the palm and fingers toward the camera like the training examples, hold the pose steady, and recalibrate that label if it still does not generalize to the demo signer.
- **No hand:** Improve lighting, keep the complete hand in frame, and avoid motion blur.
- **Hand tracked · unknown sign:** MediaPipe sees the hand, but the completed motion does not match a temporal word, fingerspelling pose, or calibrated template. Perform the complete motion at a steady pace or open **Recognition setup and fallback**.
