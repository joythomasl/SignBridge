const HAND_VECTOR_SIZE = 21 * 3;

function normalizeHand(landmarks, mirrorX = false) {
  if (!landmarks || landmarks.length !== 21) return new Array(HAND_VECTOR_SIZE).fill(0);

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const rawDx = middleMcp.x - wrist.x;
  const rawDy = middleMcp.y - wrist.y;
  const scale = Math.max(Math.hypot(rawDx, rawDy, middleMcp.z - wrist.z), 1e-5);
  const rotation = Math.atan2(rawDy, rawDx) - Math.PI / 2;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const vector = [];

  for (const point of landmarks) {
    let x = (point.x - wrist.x) / scale;
    const y = (point.y - wrist.y) / scale;
    const z = (point.z - wrist.z) / scale;
    if (mirrorX) x *= -1;
    vector.push(x * cos - y * sin, x * sin + y * cos, z);
  }
  return vector;
}

export function landmarksToVector(result) {
  const slots = {
    Left: new Array(HAND_VECTOR_SIZE).fill(0),
    Right: new Array(HAND_VECTOR_SIZE).fill(0)
  };

  (result?.landmarks || []).forEach((landmarks, index) => {
    const handedness = result?.handedness?.[index]?.[0]?.categoryName || (index === 0 ? "Right" : "Left");
    slots[handedness] = normalizeHand(landmarks, handedness === "Left");
  });

  return [...slots.Left, ...slots.Right];
}

export function averageVectors(vectors) {
  if (!vectors.length) return [];
  const length = vectors[0].length;
  const average = new Array(length).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < length; i += 1) average[i] += vector[i] || 0;
  }
  return average.map((value) => value / vectors.length);
}

export function cosineSimilarity(a, b) {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

export function findBestMatch(vector, templates) {
  let best = { gloss: null, score: 0 };
  for (const [gloss, template] of Object.entries(templates || {})) {
    const score = cosineSimilarity(vector, template.vector);
    if (score > best.score) best = { gloss, score };
  }
  return best;
}

export class StableGestureDetector {
  constructor({ threshold, holdMs, cooldownMs, onCandidate, onAccept }) {
    this.threshold = threshold;
    this.holdMs = holdMs;
    this.cooldownMs = cooldownMs;
    this.onCandidate = onCandidate;
    this.onAccept = onAccept;
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.since = 0;
    this.cooldownUntil = 0;
    this.lockedGloss = null;
  }

  update(match, now = performance.now()) {
    if (!match.gloss || match.score < this.threshold || now < this.cooldownUntil) {
      if (!match.gloss || match.score < this.threshold) this.lockedGloss = null;
      this.candidate = null;
      this.since = 0;
      this.onCandidate?.(match);
      return;
    }

    if (this.lockedGloss === match.gloss) {
      this.onCandidate?.(match);
      return;
    }

    if (this.candidate !== match.gloss) {
      this.candidate = match.gloss;
      this.since = now;
      this.onCandidate?.(match);
      return;
    }

    this.onCandidate?.(match);
    if (now - this.since >= this.holdMs) {
      this.onAccept?.(match);
      this.lockedGloss = match.gloss;
      this.cooldownUntil = now + this.cooldownMs;
      this.candidate = null;
      this.since = 0;
    }
  }
}
