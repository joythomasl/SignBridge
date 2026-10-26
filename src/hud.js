import { DEMO_GLOSSES, INTENTS } from "./constants.js";

export class SignBridgeHud {
  constructor(handlers, vocabulary = DEMO_GLOSSES) {
    this.handlers = handlers;
    this.vocabulary = vocabulary;
    this.signFrames = [];
    this.signFrameIndex = 0;
    this.signFrameTimer = null;
    this.signFrameRate = 10;
    this.signPlaybackRate = 1;
    this.host = document.createElement("div");
    this.host.id = "signbridge-root";
    this.host.dataset.signbridge = "true";
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.innerHTML = this.template();
    document.documentElement.appendChild(this.host);
    this.bind();
  }

  template() {
    const glossOptions = this.vocabulary.map((item) => `<option value="${item}">${item}</option>`).join("");
    const intentOptions = INTENTS.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
    return `
      <link rel="stylesheet" href="${chrome.runtime.getURL("hud.css")}">
      <aside class="sb-shell" aria-label="SignBridge AI">
        <header class="sb-header">
          <div>
            <strong>SignBridge AI</strong>
            <small>Gemma 4 · ISL prototype</small>
          </div>
          <div class="sb-header-actions">
            <span id="sb-mode-badge" class="sb-badge">Checking…</span>
            <button id="sb-collapse" class="sb-icon" title="Collapse">−</button>
          </div>
        </header>
        <div id="sb-body" class="sb-body">
          <div id="sb-status" class="sb-status" data-kind="info">Ready to configure</div>

          <section class="sb-section">
            <div class="sb-section-title"><span>1</span> Interviewer question</div>
            <textarea id="sb-question" rows="2" placeholder="Meet captions are detected and translated automatically…"></textarea>
            <small id="sb-caption-state" class="sb-muted">Live caption detection is active</small>
          </section>

          <section class="sb-section sb-sign-output">
            <div class="sb-section-title"><span>2</span> Interviewer → ISL</div>
            <div class="sb-sign-stage">
              <video id="sb-sign-video" playsinline controls hidden></video>
              <img id="sb-sign-image" alt="ISL dataset animation" hidden>
              <div id="sb-sign-placeholder" class="sb-sign-placeholder">Translate a supported question to play its verified ISL clip.</div>
            </div>
            <div id="sb-sign-caption" class="sb-sign-caption"></div>
            <div id="sb-sign-glosses" class="sb-chips"></div>
            <div class="sb-row">
              <button id="sb-replay-sign">Replay</button>
              <button id="sb-slower-sign">Slower</button>
              <span id="sb-sign-quality" class="sb-quality"></span>
            </div>
            <details class="sb-details">
              <summary>ISL phrase clip studio</summary>
              <p class="sb-muted">Bundled dataset clips require ISL review. A knowledgeable signer can record verified replacements here.</p>
              <select id="sb-clip-intent">${intentOptions}</select>
              <div class="sb-row">
                <button id="sb-record-clip">Record phrase</button>
                <button id="sb-stop-record" disabled>Stop & save</button>
                <button id="sb-delete-clip" class="sb-danger-text">Delete</button>
              </div>
              <div id="sb-clip-status" class="sb-muted">No recording in progress</div>
            </details>
          </section>

          <section class="sb-section">
            <div class="sb-section-title"><span>3</span> Candidate signs</div>
            <div class="sb-camera-stage">
              <video id="sb-camera" muted playsinline></video>
              <canvas id="sb-canvas"></canvas>
              <div id="sb-detected" class="sb-detected">No gesture</div>
            </div>
            <div class="sb-row">
              <button id="sb-start-camera" class="sb-primary">Start camera</button>
              <button id="sb-stop-camera" disabled>Stop</button>
            </div>
            <div class="sb-live-banner"><strong>Live sign → audio always on</strong><small>Signs are spoken automatically after a short neutral pause.</small></div>
            <div id="sb-live-state" class="sb-muted" data-active="true">Waiting for camera and signs</div>
            <div id="sb-gloss-buffer" class="sb-chips sb-buffer"></div>
            <button id="sb-clear-glosses" class="sb-full-button">Clear current phrase</button>
            <details class="sb-details">
              <summary>Recognition setup and fallback</summary>
              <p class="sb-muted">Calibration is needed only for signs the camera has not learned for this signer.</p>
              <div class="sb-calibration">
                <select id="sb-calibration-gloss">${glossOptions}</select>
                <button id="sb-calibrate">Calibrate sign</button>
              </div>
              <button id="sb-add-gloss" class="sb-full-button">Add selected gloss manually</button>
              <div id="sb-calibration-state" class="sb-muted">Calibrate only the signs used in your demo.</div>
            </details>
          </section>

          <section class="sb-section">
            <div class="sb-section-title"><span>4</span> Candidate review</div>
            <textarea id="sb-answer" rows="3" placeholder="Gemma 4 answer appears here for review…"></textarea>
            <label class="sb-check"><input id="sb-approved" type="checkbox"> I reviewed and approve this wording</label>
            <div class="sb-row sb-wrap">
              <button id="sb-speak" disabled>Speak</button>
              <button id="sb-copy" disabled>Copy</button>
              <button id="sb-chat" disabled>Insert in Meet chat</button>
            </div>
            <div id="sb-metrics" class="sb-muted"></div>
          </section>

          <details class="sb-section sb-details" open>
            <summary>Gemma 4 settings</summary>
            <label>Endpoint<input id="sb-endpoint" type="url" placeholder="http://localhost:11434"></label>
            <label>Model<input id="sb-model" type="text" placeholder="gemma4:e2b-it-q4_K_M"></label>
            <label>API key (optional)<input id="sb-api-key" type="password" autocomplete="off"></label>
            <div class="sb-row">
              <button id="sb-save-settings">Save</button>
              <button id="sb-check-gemma" class="sb-primary">Check Gemma</button>
            </div>
          </details>
        </div>
      </aside>`;
  }

  $(selector) {
    return this.shadow.querySelector(selector);
  }

  bind() {
    const actions = {
      "#sb-start-camera": "startCamera",
      "#sb-stop-camera": "stopCamera",
      "#sb-calibrate": "calibrate",
      "#sb-add-gloss": "addGloss",
      "#sb-clear-glosses": "clearGlosses",
      "#sb-speak": "speak",
      "#sb-copy": "copy",
      "#sb-chat": "insertChat",
      "#sb-save-settings": "saveSettings",
      "#sb-check-gemma": "checkGemma",
      "#sb-replay-sign": "replaySign",
      "#sb-slower-sign": "slowerSign",
      "#sb-record-clip": "recordClip",
      "#sb-stop-record": "stopRecording",
      "#sb-delete-clip": "deleteClip"
    };
    for (const [selector, handler] of Object.entries(actions)) {
      this.$(selector).addEventListener("click", () => this.handlers[handler]?.());
    }
    this.$("#sb-approved").addEventListener("change", (event) => this.setApproved(event.target.checked));
    this.$("#sb-question").addEventListener("input", (event) => this.handlers.questionChanged?.(event.target.value.trim()));
    this.$("#sb-answer").addEventListener("input", () => {
      this.$("#sb-approved").checked = false;
      this.setApproved(false);
    });
    this.$("#sb-collapse").addEventListener("click", () => {
      const body = this.$("#sb-body");
      body.hidden = !body.hidden;
      this.$("#sb-collapse").textContent = body.hidden ? "+" : "−";
    });
  }

  get video() { return this.$("#sb-camera"); }
  get canvas() { return this.$("#sb-canvas"); }
  getQuestion() { return this.$("#sb-question").value.trim(); }
  getAnswer() { return this.$("#sb-answer").value.trim(); }
  getCalibrationGloss() { return this.$("#sb-calibration-gloss").value; }
  getClipIntent() { return this.$("#sb-clip-intent").value; }

  getSettingsForm() {
    return {
      endpoint: this.$("#sb-endpoint").value.trim(),
      model: this.$("#sb-model").value.trim(),
      apiKey: this.$("#sb-api-key").value
    };
  }

  setSettings(settings) {
    this.$("#sb-endpoint").value = settings.endpoint || "";
    this.$("#sb-model").value = settings.model || "";
    this.$("#sb-api-key").value = settings.apiKey || "";
    this.setLiveState("Always-live mode ready — pause briefly to speak", true);
    this.$("#sb-mode-badge").textContent = settings.endpoint?.includes("localhost") || settings.endpoint?.includes("127.0.0.1") ? "Gemma 4 local" : "Gemma 4 network";
  }

  setStatus(message, kind = "info") {
    const status = this.$("#sb-status");
    status.textContent = message;
    status.dataset.kind = kind;
  }

  setQuestion(question, source = "manual") {
    this.$("#sb-question").value = question;
    this.$("#sb-caption-state").textContent = source === "caption" ? "Latest Meet caption captured" : "Using manual question";
  }

  showLatestCaption(caption) {
    this.$("#sb-caption-state").textContent = `Caption ready: ${caption.slice(0, 70)}${caption.length > 70 ? "…" : ""}`;
  }

  setCameraRunning(running) {
    this.$("#sb-start-camera").disabled = running;
    this.$("#sb-stop-camera").disabled = !running;
  }

  setLiveState(message, active = true) {
    const state = this.$("#sb-live-state");
    state.textContent = message;
    state.dataset.active = String(Boolean(active));
  }

  setDetected(match) {
    const label = this.$("#sb-detected");
    if (!match?.gloss) label.textContent = match?.handPresent ? "Hand tracked · unknown sign" : "No hand";
    else label.textContent = `${match.gloss} · ${Math.round(match.score * 100)}%`;
  }

  setCalibrationState(message, progress = 0) {
    this.$("#sb-calibration-state").textContent = progress ? `${message} ${Math.round(progress * 100)}%` : message;
  }

  renderGlosses(glosses, removeHandler) {
    const container = this.$("#sb-gloss-buffer");
    container.replaceChildren();
    if (!glosses.length) {
      const empty = document.createElement("span");
      empty.className = "sb-muted";
      empty.textContent = "Detected signs will appear here";
      container.appendChild(empty);
      return;
    }
    glosses.forEach((gloss, index) => {
      const chip = document.createElement("button");
      chip.className = "sb-chip";
      chip.textContent = `${gloss} ×`;
      chip.title = "Remove sign";
      chip.addEventListener("click", () => removeHandler(index));
      container.appendChild(chip);
    });
  }

  setAnswer(answer, needsClarification = false) {
    this.$("#sb-answer").value = answer;
    this.$("#sb-approved").checked = false;
    this.setApproved(false);
    if (needsClarification) this.setStatus("Gemma needs clarification. Review the literal answer before approving.", "warn");
  }

  setApproved(approved) {
    const enabled = approved && Boolean(this.getAnswer());
    ["#sb-speak", "#sb-copy", "#sb-chat"].forEach((selector) => { this.$(selector).disabled = !enabled; });
  }

  setMetrics(metrics) {
    if (!metrics?.totalDurationNs) {
      this.$("#sb-metrics").textContent = "";
      return;
    }
    this.$("#sb-metrics").textContent = `Gemma 4: ${(metrics.totalDurationNs / 1e9).toFixed(2)}s · ${metrics.outputTokens || 0} output tokens`;
  }

  showSignResult({ question, glosses, clipUrl, frameSequences = [], exact, quality, message }) {
    const video = this.$("#sb-sign-video");
    const image = this.$("#sb-sign-image");
    const placeholder = this.$("#sb-sign-placeholder");
    this.stopFrameAnimation();
    this.signFrames = [];
    this.$("#sb-sign-caption").textContent = question;
    const chips = this.$("#sb-sign-glosses");
    chips.replaceChildren(...glosses.map((gloss) => {
      const span = document.createElement("span");
      span.className = "sb-chip sb-chip-static";
      span.textContent = gloss;
      return span;
    }));
    this.$("#sb-sign-quality").textContent = quality || (exact ? "Verified phrase clip" : "Approximate / unsupported");
    this.$("#sb-sign-quality").dataset.exact = String(Boolean(exact));
    if (clipUrl) {
      video.src = clipUrl;
      video.hidden = false;
      image.hidden = true;
      placeholder.hidden = true;
      video.playbackRate = 1;
      video.play().catch(() => {});
    } else if (frameSequences.length) {
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      image.hidden = false;
      placeholder.hidden = true;
      this.signFrames = frameSequences.flatMap((sequence) => [
        ...sequence.frames,
        ...Array(4).fill(sequence.frames.at(-1))
      ]).filter(Boolean);
      this.signFrameRate = frameSequences[0]?.fps || 10;
      this.playFrameAnimation(true);
    } else {
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      image.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = message || "No verified ISL clip is recorded for this question.";
    }
  }

  replaySign() {
    const video = this.$("#sb-sign-video");
    if (!video.hidden && video.src) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else if (this.signFrames.length) {
      this.playFrameAnimation(true);
    }
  }

  slowerSign() {
    const video = this.$("#sb-sign-video");
    if (!video.hidden && video.src) {
      video.playbackRate = video.playbackRate === 0.65 ? 1 : 0.65;
      this.signPlaybackRate = video.playbackRate;
    } else if (this.signFrames.length) {
      this.signPlaybackRate = this.signPlaybackRate === 0.65 ? 1 : 0.65;
      this.playFrameAnimation(true);
    }
    this.$("#sb-slower-sign").textContent = this.signPlaybackRate === 0.65 ? "Normal speed" : "Slower";
  }

  playFrameAnimation(reset = false) {
    this.stopFrameAnimation();
    if (!this.signFrames.length) return;
    if (reset) this.signFrameIndex = 0;
    const image = this.$("#sb-sign-image");
    const interval = Math.round(1000 / (this.signFrameRate * this.signPlaybackRate));
    const step = () => {
      if (this.signFrameIndex >= this.signFrames.length) {
        this.stopFrameAnimation();
        return;
      }
      image.src = this.signFrames[this.signFrameIndex];
      this.signFrameIndex += 1;
      this.signFrameTimer = setTimeout(step, interval);
    };
    step();
  }

  stopFrameAnimation() {
    if (this.signFrameTimer) clearTimeout(this.signFrameTimer);
    this.signFrameTimer = null;
  }

  setRecording(recording, message) {
    this.$("#sb-record-clip").disabled = recording;
    this.$("#sb-stop-record").disabled = !recording;
    this.$("#sb-clip-status").textContent = message;
  }
}
