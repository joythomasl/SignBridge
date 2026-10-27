# Local verification

On 27 October 2026, the following checks passed in the project workspace:

| Check | Result |
|---|---|
| `npm test` | Alphabet mapping, J/Z geometry, winner feature schema, output decoding, and Gemma request tests passed. |
| `npm run smoke:kaggle` | The released model's SHA-256 matched; 20×390 and 128×390 synthetic inputs ran through browser TFLite. |
| `npm run smoke:browser` | The MV3 extension loaded the model, started its camera, activated a mocked Meet caption toggle, read the caption, spoke `HELLO` automatically, and sent it through mocked Meet chat. The mock Meet toggle remained clickable and unaffected by extension CSS. |
| `npm run smoke:ollama` | The installed Gemma 4 model preserved literal fingerspelling and cleaned a question caption. |

These are integration checks. The synthetic TFLite input does not measure letter recognition accuracy. The bundled static examples are not a signer-independent benchmark. To claim a character error rate for this extension, record a held-out evaluation set from different signers and run the entire Chrome capture and decode path against it.
