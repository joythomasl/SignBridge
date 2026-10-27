import { classifyAslLetter, normalizeAslHand } from "./alphabet.js";
import { detectMotionLetter } from "./motion.js";

/** Commits a held letter on a sign change or hand release, never per frame. */
export class LetterDecoder {
  constructor(model) { this.model = model; this.reset(); }
  reset() { this.active = null; this.pending = null; this.lastSeen = 0; }

  finish() {
    const active = this.active;
    this.active = null;
    this.pending = null;
    if (!active || active.count < 6 || active.lastAt - active.since < 420) return null;
    const motion = detectMotionLetter(active.label, active.samples);
    return motion || { gloss: active.label, score: active.score / active.count };
  }

  push(hand, now) {
    const accepted = [];
    if (!hand) {
      if (this.active && now - this.lastSeen >= 180) {
        const letter = this.finish();
        if (letter) accepted.push(letter);
      }
      return { accepted, preview: null };
    }
    this.lastSeen = now;
    const match = classifyAslLetter(normalizeAslHand(hand), this.model);
    const label = match?.score >= 0.8 ? match.gloss : null;
    if (!label) return { accepted, preview: null };
    if (!this.active) {
      this.active = { label, since: now, lastAt: now, count: 1, score: match.score, samples: [{ points: hand.points }] };
      return { accepted, preview: label };
    }
    if (label === this.active.label) {
      this.pending = null;
      this.active.lastAt = now;
      this.active.count++;
      this.active.score += match.score;
      this.active.samples.push({ points: hand.points });
      if (this.active.samples.length > 55) this.active.samples.shift();
      return { accepted, preview: label };
    }
    if (this.pending?.label !== label) this.pending = { label, since: now, count: 1 };
    else this.pending.count++;
    if (this.pending.count >= 4 && now - this.pending.since >= 120) {
      const letter = this.finish();
      if (letter) accepted.push(letter);
      this.active = { label, since: now, lastAt: now, count: 1, score: match.score, samples: [{ points: hand.points }] };
    }
    return { accepted, preview: this.active.label };
  }
}
