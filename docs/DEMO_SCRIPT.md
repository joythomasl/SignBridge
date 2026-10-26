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
2. The stabilized Meet caption is detected automatically and the best available ISL animation starts without a button.
3. Point out the visible quality label: exact dataset phrase, approximate sequence, or fingerspelling fallback.
4. Candidate signs the calibrated sequence: `ME`, `PYTHON`, `AI`, `PROJECT`, `THREE`, `YEAR`.
5. Pause briefly; Gemma renders the phrase and TTS speaks it automatically without pressing Finish.
6. Show the generated transcript and optionally approve it for insertion as a Meet chat draft.

## Failure-safe line

If recognition or captions fail:

> “The prototype deliberately abstains instead of fabricating a translation. I’ll use the visible manual fallback and continue the same Gemma 4-controlled workflow.”

Type the question manually and use **Recognition setup and fallback** only if camera recognition needs calibration or manual gloss entry.
