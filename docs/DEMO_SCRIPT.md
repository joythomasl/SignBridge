# 90-second demo

1. Build and reload the extension, open Meet, enable captions, and start the camera. The status should say A–Z enabled.
2. Ask a question. Show its caption in the panel and bottom overlay.
3. Fingerspell a short word, changing handshape between letters. Use the manual selector if a letter is wrong. Demonstrate Space and Backspace.
4. Lower the hand. The text is spoken locally and posted to Meet chat when its composer is available.
5. Explain the limit clearly: the released first-place TFLite weights decode complete spelling sequences, while the live preview uses 24 static handshapes and J/Z motion checks. The browser adaptation uses fixed 128-frame resampling, and this is not a validated interpreter for every signer.

Remote Meet audio requires a virtual microphone or loopback source; local browser speech synthesis is not itself a Meet microphone stream.
