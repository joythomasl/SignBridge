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

export function generateAnswer(settings, question, glosses) {
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
      used_glosses: { type: "array", items: { type: "string" } },
      needs_clarification: { type: "boolean" }
    },
    required: ["answer", "used_glosses", "needs_clarification"]
  };

  const system = [
    "You are the constrained language renderer in an accessibility prototype.",
    "Return JSON only and obey the supplied schema.",
    "Write one first-person English sentence of at most 20 words.",
    "Use only facts explicitly represented by the glosses. The question supplies context, not facts about the candidate.",
    "Never add companies, technologies, achievements, metrics, methods, durations, or examples absent from the glosses.",
    "Preserve numbers and negation exactly.",
    "If meaning is insufficient, set needs_clarification true and keep the answer literal."
  ].join(" ");

  return runtimeMessage({
    type: "GEMMA_CHAT",
    settings,
    schema,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ question, glosses }) }
    ]
  });
}

export function mapQuestionToSign(settings, question, intents, availableClips) {
  const intentIds = intents.map((intent) => intent.id);
  const clipIds = availableClips.map((clip) => clip.id);
  const schema = {
    type: "object",
    properties: {
      intent: { type: "string", enum: [...intentIds, "UNSUPPORTED"] },
      exact_clip: { type: "string", enum: ["NONE", ...clipIds] },
      clips: { type: "array", items: { type: "string", enum: clipIds }, maxItems: 8 },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    },
    required: ["intent", "exact_clip", "clips", "confidence"]
  };

  const system = [
    "Map an interview question to a constrained library of Indian Sign Language dataset clips.",
    "Return JSON only and obey the schema.",
    "Select exact_clip only when one available phrase label expresses the complete question; otherwise use NONE.",
    "For clips, select the smallest useful ordered sequence from the available labels and never invent a label.",
    "Use UNSUPPORTED when no interview intent is a clear match, but clips may still provide an approximate rendering.",
    "Do not treat ASL and ISL as interchangeable."
  ].join(" ");

  return runtimeMessage({
    type: "GEMMA_CHAT",
    settings,
    schema,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({
          question,
          supported_intents: intents,
          available_clips: availableClips
        })
      }
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
