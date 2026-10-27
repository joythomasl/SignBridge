# Local verification

On 27 October 2026, the following checks passed in the project workspace:

| Check | Result |
|---|---|
| `npm test` | Alphabet mapping, J/Z geometry, winner feature schema, output decoding, and Gemma request tests passed. |
| `npm run smoke:kaggle` | The released model's SHA-256 matched; a 128×390 synthetic input ran through browser TFLite and produced a 28×63 output. |
| `npm run smoke:browser` | The MV3 extension loaded the first-place model in a sandboxed frame, detected a Meet caption, rendered `HELLO`, and sent it through a mocked Meet chat. |
| `npm run smoke:ollama` | The installed Gemma 4 model preserved literal fingerspelling and cleaned a question caption. |

These are integration checks. The synthetic TFLite input does not measure letter recognition accuracy. The bundled static examples are not a signer-independent benchmark. To claim a character error rate for this extension, record a held-out evaluation set from different signers and run the entire Chrome capture and decode path against it.
