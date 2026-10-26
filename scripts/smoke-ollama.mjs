import { performance } from "node:perf_hooks";

const endpoint = (process.env.SIGNBRIDGE_OLLAMA_URL || "http://localhost:11434").replace(/\/+$/, "");
const model = process.env.SIGNBRIDGE_MODEL || "gemma4:e2b-it-q4_K_M";

async function chat(label, schema, messages) {
  const startedAt = performance.now();
  const response = await fetch(`${endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      think: false,
      format: schema,
      keep_alive: "30m",
      options: { num_predict: 96, temperature: 0.2, top_p: 0.9 }
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${label} failed with ${response.status}`);
  const parsed = JSON.parse(payload.message.content);
  const elapsedMs = performance.now() - startedAt;
  console.log(JSON.stringify({
    label,
    elapsedMs: Math.round(elapsedMs),
    ollamaDurationMs: Math.round((payload.total_duration || 0) / 1e6),
    output: parsed
  }, null, 2));
  return parsed;
}

const answerSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    used_glosses: { type: "array", items: { type: "string" } },
    needs_clarification: { type: "boolean" }
  },
  required: ["answer", "used_glosses", "needs_clarification"]
};

const signSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["ASK_INTRODUCTION", "ASK_EXPERIENCE", "ASK_PROJECT", "ASK_SKILLS", "ASK_TEAMWORK", "UNSUPPORTED"]
    },
    glosses: {
      type: "array",
      items: {
        type: "string",
        enum: ["YOU", "INTRODUCE", "EXPERIENCE", "PROJECT", "PYTHON", "AI", "SKILLS", "TEAM", "WORK", "EXPLAIN", "QUESTION"]
      },
      maxItems: 6
    },
    confidence: { type: "number", minimum: 0, maximum: 1 }
  },
  required: ["intent", "glosses", "confidence"]
};

await chat("candidate-answer", answerSchema, [
  {
    role: "system",
    content: "Return JSON only. Write one first-person sentence of at most 20 words. Use only facts explicitly represented by the glosses. Never invent details."
  },
  {
    role: "user",
    content: JSON.stringify({
      question: "What experience do you have with Python and AI?",
      glosses: ["ME", "PYTHON", "AI", "PROJECT", "THREE", "YEAR"]
    })
  }
]);

await chat("question-to-isl", signSchema, [
  {
    role: "system",
    content: "Map the question to one supported ISL phrase intent. Return JSON only. Use UNSUPPORTED if no intent clearly matches."
  },
  {
    role: "user",
    content: JSON.stringify({
      question: "Please explain a project you worked on.",
      supported_intents: ["ASK_INTRODUCTION", "ASK_EXPERIENCE", "ASK_PROJECT", "ASK_SKILLS", "ASK_TEAMWORK"]
    })
  }
]);
