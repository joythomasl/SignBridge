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

const CAPTION_CONTAINERS = [
  'div[jsname="dsyhDe"]', '.a4cQT',
  '[role="region"][aria-label*="caption" i]',
  'div[aria-live="polite"][jscontroller]'
];
const CAPTION_ENTRIES = 'div[jsname="tgaKEf"], .nMcdL, .TBMuR';
const CAPTION_TEXT = '.ygicle, div[jsname="YSxPC"], .bh44bd, .iTTPOb';
const CAPTION_SPEAKERS = '.NWpY1d, .KcIKyf, .zs7s8d';

export class MeetAdapter {
  constructor({ onCaption }) {
    this.onCaption = onCaption;
    this.lastCaption = "";
    this.pendingCaption = "";
    this.captionTimer = null;
    this.observer = null;
    this.pageObserver = null;
    this.scanTimer = null;
    this.container = null;
    this.ccAttempted = false;
    this.lastCcSearchAt = 0;
    this.startedAt = 0;
  }

  start() {
    this.startedAt = performance.now();
    this.pageObserver = new MutationObserver(() => this.findCaptionContainer());
    this.pageObserver.observe(document.body, { childList: true, subtree: true });
    this.scanTimer = setInterval(() => this.findCaptionContainer(), 500);
    this.findCaptionContainer();
  }

  stop() {
    this.observer?.disconnect();
    this.pageObserver?.disconnect();
    clearInterval(this.scanTimer);
    clearTimeout(this.captionTimer);
  }

  findCaptionContainer() {
    const found = CAPTION_CONTAINERS.flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((element) => !belongsToSignBridge(element) && isVisible(element));
    if (!found) {
      this.observer?.disconnect();
      this.container = null;
      if (!this.ccAttempted && performance.now() - this.startedAt > 1500) this.enableCaptionsOnce();
      return;
    }
    if (found !== this.container) {
      this.observer?.disconnect();
      this.container = found;
      this.observer = new MutationObserver(() => this.readCaptions());
      this.observer.observe(found, { childList: true, subtree: true, characterData: true });
    }
    this.readCaptions();
  }

  enableCaptionsOnce() {
    if (performance.now() - this.lastCcSearchAt < 5000) return;
    this.lastCcSearchAt = performance.now();
    const button = deepQueryAll('button, [role="button"]').find((item) => {
      if (!isVisible(item) || belongsToSignBridge(item)) return false;
      const label = [item.getAttribute("aria-label"), item.getAttribute("title"), item.textContent].join(" ").toLowerCase();
      return /closed_caption_off|turn on captions|enable captions/.test(label);
    });
    if (button) { this.ccAttempted = true; button.click(); }
  }

  readCaptions() {
    const container = this.container;
    if (!container) return;
    const entries = [...container.querySelectorAll(CAPTION_ENTRIES)];
    if (entries.length) {
      for (const entry of entries.slice(-2)) {
        const speaker = normalizeText(entry.querySelector(CAPTION_SPEAKERS)?.textContent);
        const textElement = entry.querySelector(CAPTION_TEXT) || entry.lastElementChild || entry;
        let caption = normalizeText(textElement.innerText || textElement.textContent);
        if (speaker && caption.startsWith(speaker)) caption = normalizeText(caption.slice(speaker.length));
        if (this.looksLikeCaption(caption)) this.queueCaption(caption);
      }
      return;
    }
    const textElement = container.querySelector(CAPTION_TEXT) || container;
    const lines = String(textElement.innerText || textElement.textContent || "")
      .split(/[\r\n]+/)
      .map(normalizeText)
      .filter(Boolean);
    if (lines.length > 1 && lines[0].length <= 48 && lines[0].split(" ").length <= 5) lines.shift();
    const caption = normalizeText(lines.join(" "));
    if (this.looksLikeCaption(caption)) this.queueCaption(caption);
  }

  looksLikeCaption(text) {
    if (!text || text === this.lastCaption || text.length < 4 || text.length > 320) return false;
    if (/^(captions? (are )?(on|off)|turn(ed)? on captions|turn(ed)? off captions)$/i.test(text)) return false;
    const words = text.split(" ");
    return words.length >= 2;
  }

  queueCaption(text) {
    this.pendingCaption = text;
    if (this.captionTimer) return;
    this.captionTimer = setTimeout(() => {
      this.captionTimer = null;
      if (!this.pendingCaption || this.pendingCaption === this.lastCaption) return;
      this.lastCaption = this.pendingCaption;
      this.onCaption?.(this.lastCaption);
    }, 220);
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
    let openedByUs = false;
    let chatButton = null;
    if (!this.findChatInput()) {
      chatButton = deepQueryAll('button, [role="button"]')
        .find((button) => isVisible(button) && !belongsToSignBridge(button)
          && /chat|in.call messages|messages/i.test([
            button.getAttribute("aria-label"), button.getAttribute("data-tooltip"),
            button.getAttribute("title"), button.textContent?.slice(0, 60)
          ].join(" ")));
      if (chatButton) { chatButton.click(); openedByUs = true; }
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
    if (openedByUs && isVisible(chatButton)) chatButton.click();
    return true;
  }
}
