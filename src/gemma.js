function runtimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!response?.ok) reject(new Error(response?.error || "Gemma request failed"));
      else resolve(response.data);
    });
  });
}

export function checkGemma(settings) {
  return runtimeMessage({ type: "GEMMA_HEALTH", settings });
}

export function renderSpelling(settings, spelling) {
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" }
    },
    required: ["answer"]
  };

  const system = [
    "You format literal ASL fingerspelling in an accessibility prototype.",
    "Return JSON only and obey the supplied schema.",
    "Preserve every letter and word exactly in order. Add only casing and optional final punctuation.",
    "Never infer, autocomplete, correct, translate, or add words. No interviewer question is available."
  ].join(" ");

  return runtimeMessage({
    type: "GEMMA_CHAT",
    settings,
    schema,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ spelling }) }
    ]
  });
}

export function refineMeetCaption(settings, caption) {
  const schema = {
    type: "object",
    properties: {
      caption: { type: "string" },
      is_question: { type: "boolean" }
    },
    required: ["caption", "is_question"]
  };
  const system = [
    "You clean one finalized Google Meet caption for accessibility.",
    "Return JSON only and obey the schema.",
    "Preserve the exact meaning, names, technologies, numbers, and negation.",
    "Fix only obvious spacing, casing, punctuation, and unmistakable speech-recognition errors.",
    "Never add facts or rephrase the sentence. Mark whether it is a question."
  ].join(" ");
  return runtimeMessage({
    type: "GEMMA_CHAT",
    settings,
    schema,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ caption }) }
    ]
  });
}
