// ASL static alphabet model from mhmdtaha091/SignBridge (MIT).
// J and Z are motion letters and are deliberately excluded from this classifier.
export function normalizeAslHand(hand) {
  if (!hand || hand.points.length !== 21) return null;
  const p = hand.points;
  const wrist = p[0];
  const mcp = p[9];
  const size = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y, mcp.z - wrist.z);
  const scale = size > 1e-6 ? size : 1;
  // The source alphabet model used HandLandmarker's selfie-based handedness.
  // Holistic reports body side on the raw camera image, so its side is flipped
  // to reproduce the training-time convention.
  const mirror = hand.side === "right" ? -1 : 1;
  return p.flatMap((point) => [
    ((point.x - wrist.x) / scale) * mirror,
    (point.y - wrist.y) / scale,
    (point.z - wrist.z) / scale
  ]);
}

function dense(input, kernel, bias, relu) {
  const out = new Float64Array(bias.length);
  for (let j = 0; j < bias.length; j++) {
    let sum = bias[j];
    for (let i = 0; i < input.length; i++) sum += input[i] * kernel[i][j];
    out[j] = relu ? Math.max(0, sum) : sum;
  }
  return out;
}

export function classifyAslLetter(vector, model) {
  if (!vector || !model || vector.length !== model.featureSize) return null;
  const w = model.weights;
  const first = dense(vector, w[0], w[1], true);
  const second = dense(first, w[2], w[3], true);
  const logits = dense(second, w[4], w[5], false);
  const max = Math.max(...logits);
  const probabilities = Array.from(logits, (value) => Math.exp(value - max));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  let index = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[index]) index = i;
  }
  return { gloss: model.labels[index], score: probabilities[index] / total };
}
