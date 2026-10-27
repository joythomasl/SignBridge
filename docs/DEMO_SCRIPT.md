# 90-second demo

## Preflight

- Build, reload the extension, and refresh the Meet tab.
- Turn on Meet captions and open Meet chat.
- Start the SignBridge camera; confirm **250 ASL words and 24 static letters loaded**.
- Check that Gemma 4 reports ready.

## Live flow

1. Interviewer asks, “How are you?” The text appears in the interviewer caption panel and at the bottom of Meet.
2. Candidate signs **HAPPY** or another word from the supported list. The app waits for a complete motion and shows the accepted ASL word.
3. Candidate lowers both hands. Gemma 4 renders a short sentence from the recognized glosses. Browser TTS speaks it locally and the text is sent through Meet chat.
4. Show the manual correction control and explain that uncertain signs are rejected. State that J and Z are manual-only until a motion-letter model is available.

## If recognition fails

Repeat the complete sign with both hands and upper body visible. If the model remains uncertain, select the intended word in **Recognition and manual correction**. Keep the caption visible and continue the Gemma 4 response flow.

Browser TTS cannot be guaranteed to enter Meet audio without a virtual microphone or loopback device.
