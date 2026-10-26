export const DEFAULT_SETTINGS = {
  endpoint: "http://localhost:11434",
  model: "gemma4:e2b-it-q4_K_M",
  apiKey: "",
  detectionThreshold: 0.92,
  detectionHoldMs: 500,
  detectionCooldownMs: 900,
  inferenceFps: 15,
  speechRate: 0.95,
  liveSignToAudio: false,
  livePauseMs: 1200
};

export const DEMO_GLOSSES = [
  "ME",
  "YES",
  "NO",
  "PYTHON",
  "AI",
  "PROJECT",
  "EXPERIENCE",
  "TEAM",
  "SOLVE",
  "THREE",
  "YEAR",
  "THANK-YOU"
];

export const INTENTS = [
  { id: "ASK_INTRODUCTION", label: "Please introduce yourself" },
  { id: "ASK_EXPERIENCE", label: "Tell me about your experience" },
  { id: "ASK_PROJECT", label: "Explain a project" },
  { id: "ASK_SKILLS", label: "What technical skills do you have" },
  { id: "ASK_TEAMWORK", label: "How do you work with a team" }
];

export const ALLOWED_REVERSE_GLOSSES = [
  "YOU",
  "INTRODUCE",
  "EXPERIENCE",
  "PROJECT",
  "PYTHON",
  "AI",
  "SKILLS",
  "TEAM",
  "WORK",
  "EXPLAIN",
  "QUESTION"
];
