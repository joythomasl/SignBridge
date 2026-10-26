import { landmarksToVector } from "./recognizer.js";

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];
const FINGER_COLORS = ["#ffb45f", "#55e6d5", "#78a9ff", "#d68cff", "#ff7ca8"];

function colorForPoint(index) {
  if (index === 0) return "#ffffff";
  if (index <= 4) return FINGER_COLORS[0];
  if (index <= 8) return FINGER_COLORS[1];
  if (index <= 12) return FINGER_COLORS[2];
  if (index <= 16) return FINGER_COLORS[3];
  return FINGER_COLORS[4];
}

export class VisionController {
  constructor({ video, canvas, fps = 15, onVector, onError }) {
    this.video = video;
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.fps = fps;
    this.onVector = onVector;
    this.onError = onError;
    this.frame = null;
    this.stream = null;
    this.running = false;
    this.frameRequest = null;
    this.lastInferenceAt = 0;
    this.inFlight = false;
    this.ready = false;
    this.initializePromise = null;
    this.messageHandler = (event) => this.handleMessage(event);
  }

  async initialize() {
    if (this.ready) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("MediaPipe runtime timed out")), 20000);
      this.resolveInitialize = () => {
        clearTimeout(timeout);
        this.ready = true;
        resolve();
      };
      this.rejectInitialize = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });

    window.addEventListener("message", this.messageHandler);
    this.frame = document.createElement("iframe");
    this.frame.src = chrome.runtime.getURL("vision.html");
    this.frame.title = "SignBridge vision runtime";
    this.frame.hidden = true;
    this.frame.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(this.frame);

    return this.initializePromise;
  }

  async start() {
    if (this.running) return this.stream;
    await this.initialize();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: "user"
      },
      audio: false
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.loop();
    return this.stream;
  }

  stop() {
    this.running = false;
    this.inFlight = false;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  getStream() {
    return this.stream;
  }

  loop = () => {
    if (!this.running) return;
    const now = performance.now();
    const interval = 1000 / this.fps;
    if (!this.inFlight && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - this.lastInferenceAt >= interval) {
      this.lastInferenceAt = now;
      this.sendFrame(now);
    }
    this.frameRequest = requestAnimationFrame(this.loop);
  };

  async sendFrame(timestamp) {
    this.inFlight = true;
    try {
      const bitmap = await createImageBitmap(this.video);
      this.frame.contentWindow.postMessage({ type: "SIGNBRIDGE_VISION_FRAME", timestamp, bitmap }, "*", [bitmap]);
    } catch (error) {
      this.inFlight = false;
      this.onError?.(error);
    }
  }

  handleMessage(event) {
    if (event.source !== this.frame?.contentWindow) return;
    const message = event.data || {};
    if (message.type === "SIGNBRIDGE_VISION_READY") {
      this.resolveInitialize?.();
      return;
    }
    if (message.type === "SIGNBRIDGE_VISION_ERROR") {
      this.inFlight = false;
      const error = new Error(message.message || "MediaPipe failed");
      if (!this.ready) this.rejectInitialize?.(error);
      else this.onError?.(error);
      return;
    }
    if (message.type !== "SIGNBRIDGE_VISION_RESULT") return;
    this.inFlight = false;
    const result = {
      landmarks: Array.isArray(message.landmarks) ? message.landmarks : [],
      handedness: Array.isArray(message.handedness) ? message.handedness : []
    };
    this.draw(result);
    if (result.landmarks.length) this.onVector?.(landmarksToVector(result), result);
    else this.onVector?.(null, result);
  }

  draw(result) {
    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const context = this.context;
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.lineWidth = 3;

    for (const hand of result.landmarks) {
      for (const [start, end] of CONNECTIONS) {
        context.strokeStyle = colorForPoint(end);
        context.beginPath();
        context.moveTo(hand[start].x * width, hand[start].y * height);
        context.lineTo(hand[end].x * width, hand[end].y * height);
        context.stroke();
      }
      hand.forEach((point, index) => {
        context.fillStyle = colorForPoint(index);
        context.beginPath();
        context.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
        context.fill();
        if ([0, 4, 8, 12, 16, 20].includes(index)) {
          context.save();
          context.scale(-1, 1);
          context.fillStyle = "#ffffff";
          context.font = "bold 11px system-ui";
          context.fillText(String(index), -point.x * width + 6, point.y * height - 6);
          context.restore();
        }
      });
    }
    context.restore();
  }
}
