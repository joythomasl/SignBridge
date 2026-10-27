export function decodeFingerspelling(logits, shape, characterMap) {
  const [tokens, vocab] = String(shape).split(",").map(Number);
  if (vocab !== 63 || tokens * vocab !== logits.length) throw new Error("Unexpected model output shape");
  const byIndex = Object.fromEntries(Object.entries(characterMap).map(([character, index]) => [index, character]));
  const allowed = Object.entries(characterMap)
    .filter(([character]) => character === " " || /^[a-z]$/i.test(character))
    .map(([character, index]) => ({ character, index }));
  const letters = [];
  const rawCharacters = [];
  const confidence = [];
  const rawConfidence = [];
  let constrainedTokens = 0;
  for (let t = 0; t < tokens; t++) {
    const offset = t * vocab;
    let best = 0, max = -Infinity;
    for (let i = 0; i < vocab; i++) if (logits[offset + i] > max) { max = logits[offset + i]; best = i; }
    const rawCharacter = byIndex[best];
    if (rawCharacter === undefined) { if (letters.length) break; continue; }
    rawCharacters.push(rawCharacter);
    const candidate = allowed.find((item) => item.index === best)
      || allowed.reduce((current, item) => logits[offset + item.index] > logits[offset + current.index] ? item : current, allowed[0]);
    if (!candidate) continue;
    if (candidate.index !== best) constrainedTokens++;
    let total = 0;
    for (let i = 0; i < vocab; i++) total += Math.exp(logits[offset + i] - max);
    const probability = (index) => Math.exp(logits[offset + index] - max) / total;
    confidence.push(probability(candidate.index));
    rawConfidence.push(probability(best));
    letters.push(candidate.character);
  }
  return {
    text: letters.join("").trim(),
    score: confidence.length ? confidence.reduce((a, b) => a + b, 0) / confidence.length : 0,
    rawText: rawCharacters.join("").trim(),
    rawScore: rawConfidence.length ? rawConfidence.reduce((a, b) => a + b, 0) / rawConfidence.length : 0,
    constrainedTokens
  };
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
