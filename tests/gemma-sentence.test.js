import test from "node:test";
import assert from "node:assert/strict";
import { generateAnswer } from "../src/gemma.js";

test("signed glosses form a sentence without an interviewer question", async () => {
  let payload;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        payload = message;
        callback({ ok: true, data: { result: { answer: "Hello.", needs_clarification: false } } });
      }
    }
  };
  const answer = await generateAnswer({ model: "gemma4" }, ["HELLO"]);
  assert.equal(answer.result.answer, "Hello.");
  assert.deepEqual(JSON.parse(payload.messages[1].content), { glosses: ["HELLO"] });
  assert.match(payload.messages[0].content, /glosses alone/i);
});
