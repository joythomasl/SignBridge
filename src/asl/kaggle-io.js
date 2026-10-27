export function decodeFingerspelling(logits, shape, characterMap) {
  const [tokens, vocab] = String(shape).split(",").map(Number);
  if (vocab !== 63 || tokens * vocab !== logits.length) throw new Error("Unexpected model output shape");
  const byIndex = Object.fromEntries(Object.entries(characterMap).map(([character, index]) => [index, character]));
  const letters = [];
  const confidence = [];
  for (let t = 0; t < tokens; t++) {
    const offset = t * vocab;
    let best = 0, max = -Infinity;
    for (let i = 0; i < vocab; i++) if (logits[offset + i] > max) { max = logits[offset + i]; best = i; }
    const character = byIndex[best];
    if (character === undefined) { if (letters.length) break; continue; }
    let total = 0;
    for (let i = 0; i < vocab; i++) total += Math.exp(logits[offset + i] - max);
    confidence.push(1 / total);
    letters.push(character);
  }
  return { text: letters.join("").trim(), score: confidence.length ? confidence.reduce((a, b) => a + b, 0) / confidence.length : 0 };
}

export function kaggleFrame(result, columns) {
  const parts = {
    face: result.faceLandmarks?.[0],
    left_hand: result.leftHandLandmarks?.[0],
    right_hand: result.rightHandLandmarks?.[0],
    pose: result.poseLandmarks?.[0]
  };
  return columns.map((name) => {
    const match = /^([xyz])_(face|left_hand|right_hand|pose)_(\d+)$/.exec(name);
    if (!match) throw new Error(`Unknown landmark column ${name}`);
    const value = parts[match[2]]?.[Number(match[3])]?.[match[1]];
    return Number.isFinite(value) ? value : Number.NaN;
  });
}
