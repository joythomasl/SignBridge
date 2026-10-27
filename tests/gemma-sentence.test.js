import test from "node:test";
import assert from "node:assert/strict";
import { renderSpelling } from "../src/gemma.js";

test("Gemma receives literal spelling without interviewer context", async () => {
  let payload;
  globalThis.chrome = { runtime: { lastError: null, sendMessage(message, callback) {
    payload = message;
    callback({ ok: true, data: { result: { answer: "Hello." } } });
  } } };
  const answer = await renderSpelling({ model: "gemma4" }, "HELLO");
  assert.equal(answer.result.answer, "Hello.");
  assert.deepEqual(JSON.parse(payload.messages[1].content), { spelling: "HELLO" });
  assert.match(payload.messages[0].content, /preserve every letter/i);
});
