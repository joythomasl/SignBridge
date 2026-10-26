const HAND_SIZE = 21 * 3;
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

function decodeHand(values) {
  const points = Array.from({ length: 21 }, (_, index) => ({
    x: values[index * 3] || 0,
    y: values[index * 3 + 1] || 0,
    z: values[index * 3 + 2] || 0
  }));
  const present = points.slice(1).some((point) => Math.abs(point.x) + Math.abs(point.y) + Math.abs(point.z) > 1e-4);
  return present ? points : null;
}

export function decodeLandmarkVector(vector) {
  if (!Array.isArray(vector) || vector.length < HAND_SIZE * 2) return { left: null, right: null, relation: [] };
  return {
    left: decodeHand(vector.slice(0, HAND_SIZE)),
    right: decodeHand(vector.slice(HAND_SIZE, HAND_SIZE * 2)),
    relation: vector.slice(HAND_SIZE * 2)
  };
}

export function interpolateVectors(first, second, amount) {
  if (!first) return second || null;
  if (!second || first.length !== second.length) return first;
  return first.map((value, index) => value + (second[index] - value) * amount);
}

function drawHand(context, points, wrist, scale, color) {
  if (!points) return;
  const mapped = points.map((point) => ({
    x: wrist.x + point.x * scale,
    y: wrist.y + point.y * scale,
    z: point.z
  }));
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.lineWidth = 4;
  for (const [start, end] of CONNECTIONS) {
    context.beginPath();
    context.moveTo(mapped[start].x, mapped[start].y);
    context.lineTo(mapped[end].x, mapped[end].y);
    context.stroke();
  }
  mapped.forEach((point, index) => {
    const tip = [4, 8, 12, 16, 20].includes(index);
    context.beginPath();
    context.fillStyle = tip ? "#ffffff" : color;
    context.arc(point.x, point.y, Math.max(2.5, (tip ? 5 : 3.5) - point.z), 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

export function drawSigningAvatar(context, vector, width, height) {
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#061d22");
  gradient.addColorStop(1, "#020c10");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const headY = height * 0.22;
  const headRadius = Math.min(width, height) * 0.085;
  context.fillStyle = "#153d43";
  context.beginPath();
  context.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#56ddd0";
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.moveTo(centerX - width * 0.18, height * 0.72);
  context.quadraticCurveTo(centerX - width * 0.17, height * 0.39, centerX, height * 0.38);
  context.quadraticCurveTo(centerX + width * 0.17, height * 0.39, centerX + width * 0.18, height * 0.72);
  context.closePath();
  context.fillStyle = "#0e3036";
  context.fill();
  context.stroke();

  const { left, right, relation } = decodeLandmarkVector(vector);
  const twoHands = Boolean(left && right);
  const separation = twoHands ? Math.min(width * 0.29, Math.max(width * 0.16, Math.abs(relation[2] || 2) * width * 0.055)) : 0;
  const leftWrist = { x: centerX - separation, y: height * 0.69 };
  const rightWrist = { x: centerX + separation, y: height * 0.69 };
  const scale = Math.min(width, height) * (twoHands ? 0.16 : 0.2);

  context.strokeStyle = "#267780";
  context.lineWidth = 12;
  context.lineCap = "round";
  if (left) {
    context.beginPath();
    context.moveTo(centerX - width * 0.12, height * 0.44);
    context.quadraticCurveTo(centerX - width * 0.23, height * 0.55, leftWrist.x, leftWrist.y);
    context.stroke();
  }
  if (right) {
    context.beginPath();
    context.moveTo(centerX + width * 0.12, height * 0.44);
    context.quadraticCurveTo(centerX + width * 0.23, height * 0.55, rightWrist.x, rightWrist.y);
    context.stroke();
  }
  drawHand(context, left, leftWrist, scale, "#ffb45f");
  drawHand(context, right, rightWrist, scale, "#51e4d3");

  if (!left && !right) {
    context.fillStyle = "#8bb6b9";
    context.font = `600 ${Math.round(height * 0.055)}px system-ui`;
    context.textAlign = "center";
    context.fillText("pause", centerX, height * 0.58);
  }
}
