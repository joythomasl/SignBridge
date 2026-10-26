function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
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
      throw new Error("Open the Meet chat panel, then try Insert again.");
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
      document.execCommand("insertText", false, text);
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  findChatInput() {
    const selectors = [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[aria-label*="message" i]',
      'textarea[placeholder*="message" i]'
    ];
    const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    return candidates.find((element) => isVisible(element) && !element.closest("#signbridge-root")) || null;
  }

  async sendChatMessage(text) {
    if (!this.findChatInput()) {
      const chatButton = [...document.querySelectorAll('button[aria-label*="chat" i], button[data-tooltip*="chat" i]')]
        .find((button) => isVisible(button) && !button.closest("#signbridge-root"));
      chatButton?.click();
      const startedAt = performance.now();
      while (!this.findChatInput() && performance.now() - startedAt < 2500) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    this.insertChatDraft(text);
    const input = this.findChatInput();
    if (!input) throw new Error("Meet chat input is not open.");
    const sendButton = [...document.querySelectorAll('button[aria-label*="send" i]')]
      .find((button) => isVisible(button) && !button.closest("#signbridge-root"));
    if (sendButton) sendButton.click();
    else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    return true;
  }
}
