# 90-second demo script

## Preflight

- Gemma badge says **Gemma 4 local**.
- **Check Gemma** reports ready.
- The five verified ISL phrase clips are recorded.
- Required candidate gestures are calibrated.
- Meet captions and chat are open.
- The model has been warmed up.

## Live flow

1. Interviewer: “Tell me about your experience with Python and AI projects.”
2. Select **Use latest caption**, then **Show in ISL**.
3. Point out that Gemma 4 selected a supported question intent and that the full verified ISL phrase—not an invented animation—is playing.
4. Enable **Live sign → audio**.
5. Candidate signs the calibrated sequence: `ME`, `PYTHON`, `AI`, `PROJECT`, `THREE`, `YEAR`.
6. Pause briefly; Gemma renders the phrase and TTS speaks it automatically without pressing Finish.
7. Show the generated text and explain that review-first mode remains available when Live mode is off.
8. Optionally disable Live mode, approve the text, and insert the draft into Meet chat.

## Failure-safe line

If recognition or captions fail:

> “The prototype deliberately abstains instead of fabricating a translation. I’ll use the visible manual fallback and continue the same Gemma 4-controlled workflow.”

Use manual question entry and recalibrate or use the gloss buffer from a successful prior attempt.
