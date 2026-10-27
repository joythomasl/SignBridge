export class SignBridgeHud {
  constructor(handlers, vocabulary = []) {
    this.handlers = handlers;
    this.vocabulary = vocabulary;
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
    return `
      <link rel="stylesheet" href="${chrome.runtime.getURL("hud.css")}">
      <aside class="sb-shell" aria-label="SignBridge AI">
        <header class="sb-header">
          <div>
            <strong>SignBridge AI</strong>
            <small>Gemma 4 · ASL fingerspelling A–Z</small>
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
            <div class="sb-section-title"><span>2</span> Live interviewer captions</div>
            <div id="sb-interviewer-caption" class="sb-interviewer-caption" aria-live="polite">Waiting for Meet captions…</div>
          </section>

          <section class="sb-section">
            <div class="sb-section-title"><span>3</span> Candidate fingerspelling</div>
            <div class="sb-camera-stage">
              <video id="sb-camera" muted playsinline></video>
              <canvas id="sb-canvas"></canvas>
              <div id="sb-detected" class="sb-detected">No gesture</div>
            </div>
            <div class="sb-row">
              <button id="sb-start-camera" class="sb-primary">Start camera</button>
              <button id="sb-stop-camera" disabled>Stop</button>
            </div>
            <div class="sb-live-banner"><strong>ASL fingerspelling → local speech + Meet chat</strong><small>The first-place sequence model checks the completed spelling. Hold each letter, then lower your hand to speak.</small></div>
            <div id="sb-live-state" class="sb-muted" data-active="true">Waiting for camera and signs</div>
            <div id="sb-gloss-buffer" class="sb-spelling" aria-live="polite">Spelled letters appear here</div>
            <div class="sb-row"><button id="sb-space">Space</button><button id="sb-backspace">Backspace</button><button id="sb-clear-glosses">Clear</button></div>
            <details class="sb-details">
              <summary>Recognition and manual correction</summary>
              <p class="sb-muted">All 26 letters are available. The live preview uses static handshapes and J/Z motion checks; the sequence model checks the completed spelling. Repeat a letter by briefly releasing your hand. Correct uncertain results below.</p>
              <div class="sb-calibration">
                <select id="sb-calibration-gloss">${glossOptions}</select>
              </div>
              <button id="sb-add-gloss" class="sb-full-button">Add selected letter manually</button>
            </details>
          </section>

          <section class="sb-section">
            <div class="sb-section-title"><span>4</span> Spoken text</div>
            <textarea id="sb-answer" rows="3" placeholder="Completed spelling is spoken automatically…"></textarea>
            <div class="sb-row sb-wrap">
              <button id="sb-copy" disabled>Copy</button>
              <button id="sb-chat" disabled>Insert in Meet chat again</button>
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
      </aside>
      <div id="sb-caption-overlay" class="sb-caption-overlay" aria-live="polite" hidden>
        <span>Interviewer</span>
        <strong id="sb-caption-overlay-text"></strong>
      </div>`;
  }

  $(selector) {
    return this.shadow.querySelector(selector);
  }

  bind() {
    const actions = {
      "#sb-start-camera": "startCamera",
      "#sb-stop-camera": "stopCamera",
      "#sb-add-gloss": "addLetter",
      "#sb-space": "addSpace",
      "#sb-backspace": "backspace",
      "#sb-clear-glosses": "clearLetters",
      "#sb-copy": "copy",
      "#sb-chat": "insertChat",
      "#sb-save-settings": "saveSettings",
      "#sb-check-gemma": "checkGemma"
    };
    for (const [selector, handler] of Object.entries(actions)) {
      this.$(selector).addEventListener("click", () => this.handlers[handler]?.());
    }
    this.$("#sb-question").addEventListener("input", (event) => this.handlers.questionChanged?.(event.target.value.trim()));
    this.$("#sb-answer").addEventListener("input", () => this.setAnswerActions());
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
    this.$("#sb-caption-overlay-text").textContent = caption;
    this.$("#sb-caption-overlay").hidden = false;
    this.$("#sb-interviewer-caption").textContent = caption;
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
    if (match?.unstable) label.textContent = "Hand moving · hold the sign steady";
    else if (!match?.gloss) label.textContent = match?.handPresent ? "Hand tracked · unknown sign" : "No hand";
    else label.textContent = `${match.gloss} · ${Math.round(match.score * 100)}%`;
  }

  setPreview(letter) {
    this.$("#sb-detected").textContent = `Hold / change to accept: ${letter}`;
  }

  renderSpelling(letters) {
    const container = this.$("#sb-gloss-buffer");
    container.textContent = letters.length ? letters.join("") : "Spelled letters appear here";
  }

  setAnswer(answer) {
    this.$("#sb-answer").value = answer;
    this.setAnswerActions();
  }

  setAnswerActions() {
    const enabled = Boolean(this.getAnswer());
    ["#sb-copy", "#sb-chat"].forEach((selector) => { this.$(selector).disabled = !enabled; });
  }

  setMetrics(metrics) {
    if (!metrics?.totalDurationNs) {
      this.$("#sb-metrics").textContent = "";
      return;
    }
    this.$("#sb-metrics").textContent = `Gemma 4: ${(metrics.totalDurationNs / 1e9).toFixed(2)}s · ${metrics.outputTokens || 0} output tokens`;
  }

}
