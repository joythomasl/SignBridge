// Temporal letter checks inspired by the first-place Kaggle solution's
// sequence normalization. These are geometric checks, not its trained model.
function resample(points, count = 16) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths.at(-1);
  if (total < 1e-6) return [];
  return Array.from({ length: count }, (_, k) => {
    const target = total * k / (count - 1);
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < target) i++;
    const fraction = (target - lengths[i - 1]) / Math.max(lengths[i] - lengths[i - 1], 1e-6);
    return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * fraction,
      y: points[i - 1].y + (points[i].y - points[i - 1].y) * fraction };
  });
}

function template(points, knots) {
  const path = resample(knots);
  const templateMinX = Math.min(...path.map((p) => p.x));
  const templateMaxX = Math.max(...path.map((p) => p.x));
  const templateMinY = Math.min(...path.map((p) => p.y));
  const templateMaxY = Math.max(...path.map((p) => p.y));
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 1e-6 || height < 1e-6) return { error: Infinity, width, height };
  let error = 0;
  for (let i = 0; i < points.length; i++) {
    const x = (points[i].x - minX) / width;
    const y = (points[i].y - minY) / height;
    const tx = (path[i].x - templateMinX) / (templateMaxX - templateMinX);
    const ty = (path[i].y - templateMinY) / (templateMaxY - templateMinY);
    error += Math.hypot(x - tx, y - ty);
  }
  return { error: error / points.length, width, height };
}

/** Samples contain 21 raw hand points. Return J/Z only for a complete trace. */
export function detectMotionLetter(label, samples) {
  if (!(["I", "D"].includes(label)) || samples.length < 9) return null;
  const tip = label === "I" ? 20 : 8;
  const valid = samples.filter((sample) => sample.points?.length === 21);
  if (valid.length < 9) return null;
  const scale = valid.map(({ points }) => Math.hypot(points[9].x - points[0].x, points[9].y - points[0].y)).sort((a, b) => a - b)[Math.floor(valid.length / 2)];
  if (!(scale > 0.01)) return null;
  const raw = valid.map(({ points }) => ({ x: points[tip].x / scale, y: points[tip].y / scale }));
  const reduced = [raw[0]];
  for (const point of raw.slice(1)) if (Math.hypot(point.x - reduced.at(-1).x, point.y - reduced.at(-1).y) > 0.035) reduced.push(point);
  if (reduced.length < 7) return null;
  const points = resample(reduced);
  if (!points.length) return null;
  const left = (path) => path.map(({ x, y }) => ({ x: 1 - x, y }));
  const j = [{ x: 0, y: 0 }, { x: 0.05, y: 0.65 }, { x: 0.2, y: 1 }, { x: 0.65, y: 0.78 }];
  const z = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  const knots = label === "I" ? [j, left(j)] : [z, left(z)];
  const best = Math.min(...knots.map((shape) => template(points, shape).error));
  const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  if (label === "I" && width >= 0.24 && height >= 0.65 && best < 0.24) return { gloss: "J", score: Math.max(0.8, 1 - best) };
  if (label === "D" && width >= 0.7 && height >= 0.35 && best < 0.21) return { gloss: "Z", score: Math.max(0.8, 1 - best) };
  return null;
}
