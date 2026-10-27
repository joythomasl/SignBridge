# 90-second demo

1. Build and reload the extension, open Meet, and allow the camera prompt. The extension starts tracking and tries to enable Meet captions automatically.
2. Ask a question. Show its caption in the panel and bottom overlay.
3. Fingerspell a short word, changing handshape between letters. Use the manual selector if a letter is wrong. Demonstrate Space and Backspace.
4. Lower the hand. A confident full-sequence result is spoken automatically and posted to Meet chat when its composer is available.
5. Explain the limit clearly: the released first-place TFLite weights decode complete spelling sequences, while the live preview uses 24 static handshapes and J/Z motion checks. This is not a validated interpreter for every signer.

Remote Meet audio requires a virtual microphone or loopback source; Chrome text to speech is not itself a Meet microphone stream.
