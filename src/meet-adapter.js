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
    const candidates = new Set();
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
      if (!target || target.closest?.("#signbridge-root")) continue;
      const liveRegion = target.closest?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]');
      if (liveRegion) candidates.add(liveRegion);
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]')) candidates.add(node);
        node.querySelectorAll?.('[aria-live="polite"], [aria-live="assertive"], [role="log"]').forEach((item) => candidates.add(item));
      }
    }

    for (const element of candidates) {
      const text = normalizeText(element.innerText || element.textContent);
      if (this.looksLikeCaption(text)) this.queueCaption(text);
    }
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
    const selectors = [
      'div[contenteditable="true"][role="textbox"]',
      'textarea[aria-label*="message" i]',
      'textarea[placeholder*="message" i]'
    ];
    const candidates = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const input = candidates.find((element) => isVisible(element) && !element.closest("#signbridge-root"));
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
}
