function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function deepQueryAll(selector, root = document) {
  const found = [...root.querySelectorAll(selector)];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) found.push(...deepQueryAll(selector, element.shadowRoot));
  }
  return found;
}

function belongsToSignBridge(element) {
  if (element.closest?.("#signbridge-root")) return true;
  const root = element.getRootNode?.();
  return root instanceof ShadowRoot && root.host?.closest?.("#signbridge-root");
}

function inputText(input) {
  return normalizeText(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
    ? input.value : input.textContent);
}

export class MeetAdapter {
  constructor({ onCaption }) {
    this.onCaption = onCaption;
    this.lastCaption = "";
    this.pendingCaption = "";
    this.captionTimer = null;
    this.observer = null;
  }

  start() {
    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  stop() {
    this.observer?.disconnect();
    clearTimeout(this.captionTimer);
  }

  handleMutations(mutations) {
    const candidates = [];
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
      if (!target || target.closest?.("#signbridge-root")) continue;
      const liveRegion = target.closest?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]');
      if (liveRegion) candidates.push({ target, liveRegion });
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]')) candidates.push({ target: node, liveRegion: node });
        node.querySelectorAll?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]').forEach((item) => candidates.push({ target: item, liveRegion: item }));
      }
    }

    const meetCaptions = document.querySelector('[role="region"][aria-label*="caption" i]');
    if (meetCaptions) candidates.push({ target: meetCaptions, liveRegion: meetCaptions });

    for (const { target, liveRegion } of candidates) {
      const text = this.extractCaptionText(target, liveRegion);
      if (this.looksLikeCaption(text)) this.queueCaption(text);
    }
  }

  extractCaptionText(target, liveRegion) {
    let current = target;
    let best = "";
    while (current && current !== liveRegion.parentElement) {
      const text = normalizeText(current.innerText || current.textContent);
      const wordCount = text.split(" ").filter(Boolean).length;
      if (wordCount >= 2 && text.length <= 320) best = text;
      if (current === liveRegion) break;
      current = current.parentElement;
    }
    const lines = String(best || liveRegion.innerText || liveRegion.textContent || "")
      .split(/[\r\n]+/)
      .map(normalizeText)
      .filter(Boolean);
    if (lines.length > 1 && lines[0].length <= 48 && lines[0].split(" ").length <= 5) lines.shift();
    return normalizeText(lines.join(" "));
  }

  looksLikeCaption(text) {
    if (!text || text === this.lastCaption || text.length < 4 || text.length > 320) return false;
    if (/signbridge|you are presenting|microphone|camera|joined|left the call/i.test(text)) return false;
    const words = text.split(" ");
    return words.length >= 2;
  }

  queueCaption(text) {
    this.pendingCaption = text;
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => {
      if (!this.pendingCaption || this.pendingCaption === this.lastCaption) return;
      this.lastCaption = this.pendingCaption;
      this.onCaption?.(this.lastCaption);
    }, 900);
  }

  insertChatDraft(text) {
    const input = this.findChatInput();
    if (!input) {
      throw new Error("Meet chat composer was not found. Open in-call messages and try again.");
    }
    if (inputText(input) && inputText(input) !== text) {
      throw new Error("Meet chat already contains an unsent draft. Clear or send it first.");
    }

    input.focus();
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
      descriptor?.set?.call(input, text);
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("insertText", false, text)) {
        input.textContent = text;
      }
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    if (inputText(input) !== normalizeText(text)) throw new Error("Meet did not accept the chat draft.");
    return true;
  }

  findChatInput() {
    const selectors = [
      'div[contenteditable="true"]',
      'textarea',
      'input[type="text"]',
      '[role="textbox"]'
    ];
    const candidates = [...new Set(selectors.flatMap((selector) => deepQueryAll(selector)))];
    return candidates
      .filter((element) => isVisible(element) && !belongsToSignBridge(element) && !element.disabled && !element.readOnly)
      .map((element) => {
        const attributes = [element.getAttribute("aria-label"), element.getAttribute("placeholder"),
          element.getAttribute("data-placeholder"), element.getAttribute("title")].join(" ").toLowerCase();
        const parent = element.closest('[role="dialog"], [role="region"], form') || element.parentElement;
        const context = [parent?.getAttribute("aria-label"), parent?.textContent?.slice(0, 250)].join(" ").toLowerCase();
        const score = (/message|chat/.test(attributes) ? 10 : 0)
          + (/message|chat/.test(context) ? 4 : 0)
          + (element.getAttribute("contenteditable") === "true" ? 2 : 0);
        return { element, score };
      })
      .filter(({ score }) => score >= 4)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  }

  async sendChatMessage(text) {
    if (!this.findChatInput()) {
      const chatButton = deepQueryAll('button, [role="button"]')
        .find((button) => isVisible(button) && !belongsToSignBridge(button)
          && /chat|in.call messages|messages/i.test([
            button.getAttribute("aria-label"), button.getAttribute("data-tooltip"),
            button.getAttribute("title"), button.textContent?.slice(0, 60)
          ].join(" ")));
      chatButton?.click();
      const startedAt = performance.now();
      while (!this.findChatInput() && performance.now() - startedAt < 4500) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    this.insertChatDraft(text);
    const input = this.findChatInput();
    if (!input) throw new Error("Meet chat input is not open.");
    const sendButtons = deepQueryAll('button, [role="button"]')
      .filter((button) => isVisible(button) && !belongsToSignBridge(button)
        && /send/i.test([button.getAttribute("aria-label"), button.getAttribute("title"),
          button.getAttribute("data-tooltip"), button.textContent?.slice(0, 60)].join(" ")));
    const nearest = sendButtons
      .map((button) => ({ button, common: input.parentElement?.contains(button)
        || input.parentElement?.parentElement?.contains(button)
        || input.parentElement?.parentElement?.parentElement?.contains(button) }))
      .sort((a, b) => Number(b.common) - Number(a.common))[0]?.button;
    if (!nearest || nearest.disabled || nearest.getAttribute("aria-disabled") === "true") {
      throw new Error("Meet chat draft is ready, but its Send button is unavailable.");
    }
    nearest.click();
    const startedAt = performance.now();
    while (inputText(input) && performance.now() - startedAt < 1800) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (inputText(input)) throw new Error("Meet did not confirm chat delivery; the draft remains in the composer.");
    return true;
  }
}
