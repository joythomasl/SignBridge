const HAND_VECTOR_SIZE = 21 * 3;
function normalizeHand(landmarks, mirrorX = false) {
  if (!landmarks || landmarks.length !== 21) return new Array(HAND_VECTOR_SIZE).fill(0);

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const direction = mirrorX ? -1 : 1;
  const rawDx = middleMcp.x - wrist.x;
  const rawDy = middleMcp.y - wrist.y;
  const scale = Math.max(Math.hypot(rawDx, rawDy, middleMcp.z - wrist.z), 1e-5);
  const vector = [];

  for (const point of landmarks) {
    const x = ((point.x - wrist.x) / scale) * direction;
    const y = (point.y - wrist.y) / scale;
    const z = (point.z - wrist.z) / scale;
    vector.push(x, y, z);
  }
  return vector;
}

export function landmarksToVector(result) {
  const slots = {
    Left: new Array(HAND_VECTOR_SIZE).fill(0),
    Right: new Array(HAND_VECTOR_SIZE).fill(0)
  };

  if (result?.landmarks?.length === 1) {
    const handedness = result?.handedness?.[0]?.[0]?.categoryName || "Right";
    slots.Right = normalizeHand(result.landmarks[0], handedness === "Left");
    return [...slots.Left, ...slots.Right, 0, 1, 0, 0, 0, 0, 0, 0];
  }

  const rawHands = {};
  (result?.landmarks || []).forEach((landmarks, index) => {
    const handedness = result?.handedness?.[index]?.[0]?.categoryName || (index === 0 ? "Right" : "Left");
    slots[handedness] = normalizeHand(landmarks, handedness === "Left");
    rawHands[handedness] = landmarks;
  });

  const left = rawHands.Left;
  const right = rawHands.Right;
  let relation = [Number(Boolean(left)), Number(Boolean(right)), 0, 0, 0, 0, 0, 0];
  if (left && right) {
    const leftScale = Math.max(Math.hypot(left[9].x - left[0].x, left[9].y - left[0].y, left[9].z - left[0].z), 1e-5);
    const rightScale = Math.max(Math.hypot(right[9].x - right[0].x, right[9].y - right[0].y, right[9].z - right[0].z), 1e-5);
    const scale = (leftScale + rightScale) / 2;
    const dx = (right[0].x - left[0].x) / scale;
    const dy = (right[0].y - left[0].y) / scale;
    const dz = (right[0].z - left[0].z) / scale;
    relation = [1, 1, dx, dy, dz, Math.hypot(dx, dy, dz), (left[0].x + right[0].x) / 2, (left[0].y + right[0].y) / 2];
  }
  return [...slots.Left, ...slots.Right, ...relation];
}

export function classifyLandmarkVector(vector, model) {
  if (!model?.classes?.length || !model?.coef?.length || vector.length !== model.featureCount) {
    return { gloss: null, score: 0, margin: 0, source: "trained-alphabet-model" };
  }
  const standardized = vector.map((value, index) => (value - model.mean[index]) / (model.scale[index] || 1));
  const logits = model.coef.map((weights, classIndex) => {
    let value = model.intercept[classIndex] || 0;
    for (let index = 0; index < standardized.length; index += 1) value += weights[index] * standardized[index];
    return value;
  });
  const maximum = Math.max(...logits);
  const probabilities = logits.map((value) => Math.exp(value - maximum));
  const total = probabilities.reduce((sum, value) => sum + value, 0) || 1;
  const ranked = probabilities.map((value, index) => ({ index, probability: value / total })).sort((a, b) => b.probability - a.probability);
  const best = ranked[0];
  const margin = best.probability - (ranked[1]?.probability || 0);
  const centroid = model.centroids?.[best.index];
  const distance = centroid?.length === standardized.length
    ? Math.sqrt(standardized.reduce((sum, value, index) => sum + (value - centroid[index]) ** 2, 0) / standardized.length)
    : 0;
  const distanceThreshold = model.distanceThresholds?.[best.index] ?? Number.POSITIVE_INFINITY;
  const accepted = best.probability >= (model.confidenceThreshold || 0.58)
    && margin >= (model.marginThreshold || 0.12)
    && distance <= distanceThreshold;
  return {
    gloss: accepted ? model.classes[best.index] : null,
    score: best.probability,
    margin,
    distance,
    distanceThreshold,
    threshold: model.confidenceThreshold || 0.58,
    source: "trained-alphabet-model"
  };
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

function rootMeanSquareDistance(a, b) {
  if (!a?.length || a.length !== b?.length) return Number.POSITIVE_INFINITY;
  let squared = 0;
  for (let index = 0; index < a.length; index += 1) squared += (a[index] - b[index]) ** 2;
  return Math.sqrt(squared / a.length);
}

export class PoseStabilityGate {
  constructor({ windowMs = 450, minFrames = 6, maxAverageMotion = 0.04, maxPeakMotion = 0.11 } = {}) {
    this.windowMs = windowMs;
    this.minFrames = minFrames;
    this.maxAverageMotion = maxAverageMotion;
    this.maxPeakMotion = maxPeakMotion;
    this.reset();
  }

  reset() {
    this.samples = [];
  }

  update(vector, now = performance.now()) {
    if (!vector) {
      this.reset();
      return null;
    }
    this.samples.push({ vector, now });
    const cutoff = now - this.windowMs;
    while (this.samples.length > 1 && this.samples[0].now < cutoff) this.samples.shift();
    if (this.samples.length < this.minFrames || now - this.samples[0].now < this.windowMs * 0.8) return null;

    const motions = [];
    for (let index = 1; index < this.samples.length; index += 1) {
      motions.push(rootMeanSquareDistance(this.samples[index - 1].vector, this.samples[index].vector));
    }
    const averageMotion = motions.reduce((sum, motion) => sum + motion, 0) / motions.length;
    const peakMotion = Math.max(...motions);
    if (averageMotion > this.maxAverageMotion || peakMotion > this.maxPeakMotion) return null;
    return averageVectors(this.samples.map((sample) => sample.vector));
  }
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
    if (score > best.score) {
      best = {
        gloss,
        score,
        threshold: template.source === "bundled-fingerspelling-dataset" ? 0.78 : undefined,
        source: template.source || "calibrated"
      };
    }
  }
  return best;
}

export function resampleSequence(sequence, targetLength) {
  if (!sequence?.length || targetLength < 1) return [];
  if (sequence.length === targetLength) return sequence;
  if (targetLength === 1) return [sequence.at(-1)];
  return Array.from({ length: targetLength }, (_, index) => {
    const sourceIndex = Math.round(index * (sequence.length - 1) / (targetLength - 1));
    return sequence[sourceIndex];
  });
}

export function sequenceSimilarity(sequence, template) {
  if (!sequence?.length || !template?.length) return 0;
  const normalized = resampleSequence(sequence, template.length);
  let total = 0;
  for (let index = 0; index < template.length; index += 1) total += cosineSimilarity(normalized[index], template[index]);
  return total / template.length;
}

function sequenceMotionEnergy(sequence) {
  if (!sequence?.length || sequence.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < sequence.length; index += 1) {
    total += 1 - cosineSimilarity(sequence[index - 1], sequence[index]);
  }
  return total / (sequence.length - 1);
}

export function findBestSequenceMatch(frames, templates) {
  if (!frames?.length || frames.length < 18) return { gloss: null, score: 0, margin: 0 };
  const lengths = [18, 24, 30, 40, 50, 60].filter((length) => length <= frames.length);
  const matches = [];
  for (const [gloss, template] of Object.entries(templates || {})) {
    if (!template?.sequence?.length) continue;
    let score = 0;
    for (const length of lengths) {
      const sampled = resampleSequence(frames.slice(-length), template.sequence.length);
      let candidateScore = sequenceSimilarity(sampled, template.sequence);
      if (Number.isFinite(template.motion)) {
        const observedMotion = sequenceMotionEnergy(sampled);
        const largerMotion = Math.max(observedMotion, template.motion, 1e-5);
        const motionRatio = Math.min(observedMotion, template.motion) / largerMotion;
        candidateScore *= 0.7 + 0.3 * motionRatio;
      }
      score = Math.max(score, candidateScore);
    }
    matches.push({ gloss, score, source: template.source || "temporal" });
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0] || { gloss: null, score: 0 };
  const second = matches[1]?.score || 0;
  return { ...best, margin: best.score - second };
}

export class TemporalGestureDetector {
  constructor({ templates, threshold = 0.76, minMargin = 0.018, holdMs = 320, cooldownMs = 1200, onCandidate, onAccept }) {
    this.templates = templates || {};
    this.threshold = threshold;
    this.minMargin = minMargin;
    this.holdMs = holdMs;
    this.cooldownMs = cooldownMs;
    this.onCandidate = onCandidate;
    this.onAccept = onAccept;
    this.reset();
  }

  reset() {
    this.frames = [];
    this.candidate = null;
    this.since = 0;
    this.cooldownUntil = 0;
    this.lastEvaluation = 0;
    this.neutralSince = 0;
  }

  update(vector, now = performance.now()) {
    if (!vector) {
      if (!this.neutralSince) this.neutralSince = now;
      if (now - this.neutralSince > 700) this.frames = [];
      return false;
    }
    this.neutralSince = 0;
    this.frames.push(vector);
    if (this.frames.length > 60) this.frames.shift();
    if (now < this.cooldownUntil || now - this.lastEvaluation < 160 || this.frames.length < 18) return false;
    this.lastEvaluation = now;
    const match = findBestSequenceMatch(this.frames, this.templates);
    this.onCandidate?.(match);
    if (!match.gloss || match.score < this.threshold || match.margin < this.minMargin) {
      this.candidate = null;
      this.since = 0;
      return false;
    }
    if (this.candidate !== match.gloss) {
      this.candidate = match.gloss;
      this.since = now;
      return false;
    }
    if (now - this.since < this.holdMs) return false;
    this.onAccept?.(match);
    this.frames = [];
    this.candidate = null;
    this.since = 0;
    this.cooldownUntil = now + this.cooldownMs;
    return true;
  }
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
    const threshold = match.threshold ?? this.threshold;
    if (!match.gloss || match.score < threshold || now < this.cooldownUntil) {
      if (!match.gloss || match.score < threshold) this.lockedGloss = null;
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
