import { performance } from "node:perf_hooks";

const endpoint = (process.env.SIGNBRIDGE_OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const model = process.env.SIGNBRIDGE_MODEL || "gemma4:e2b-it-q4_K_M";

async function chat(label, schema, messages) {
  const startedAt = performance.now();
  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, think: false, format: schema,
      keep_alive: "30m", options: { num_predict: 96, temperature: 0 } })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${label} failed with ${response.status}`);
  const result = JSON.parse(payload.message.content);
  console.log(JSON.stringify({ label, elapsedMs: Math.round(performance.now() - startedAt), result }, null, 2));
  return result;
}

const rendered = await chat("literal-fingerspelling", {
  type: "object", properties: { answer: { type: "string" } }, required: ["answer"]
}, [
  { role: "system", content: "Return JSON only. Preserve every letter and word exactly in order. Add only casing and optional final punctuation. Never infer, autocomplete, correct, translate, or add words." },
  { role: "user", content: JSON.stringify({ spelling: "HELLO" }) }
]);
if (String(rendered.answer || "").toUpperCase().replace(/[^A-Z]/g, "") !== "HELLO") throw new Error("Gemma altered the spelling");

const caption = await chat("meet-caption", {
  type: "object", properties: { caption: { type: "string" }, is_question: { type: "boolean" } },
  required: ["caption", "is_question"]
}, [
  { role: "system", content: "Return JSON only. Clean one Google Meet caption without changing its meaning, names, numbers, or negation. Mark whether it is a question." },
  { role: "user", content: JSON.stringify({ caption: "how are you" }) }
]);
if (!caption.is_question || !/how are you/i.test(caption.caption)) throw new Error("Gemma caption check failed");
