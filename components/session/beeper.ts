/**
 * Short beeps made with the Web Audio API (no audio files). Browsers only
 * allow sound after a tap or click, so call `unlock()` from a click handler.
 */
export class Beeper {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(frequency: number, durationMs: number, delayMs = 0, volume = 0.25): void {
    if (this.muted || !this.ctx || this.ctx.state === "closed") return;
    try {
      const start = this.ctx.currentTime + delayMs / 1000;
      const end = start + durationMs / 1000;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    } catch {
      // Sound is a nice-to-have; never let it break the session.
    }
  }

  /** One counted rep. */
  rep(): void {
    this.tone(880, 120);
  }

  /** End of a set: three rising tones. */
  setComplete(): void {
    this.tone(660, 150);
    this.tone(880, 150, 170);
    this.tone(1175, 260, 340);
  }

  /** Countdown tick. */
  tick(): void {
    this.tone(520, 90, 0, 0.18);
  }

  /** Start of a hold or set. */
  go(): void {
    this.tone(990, 180);
  }

  /** End of a hold. */
  relax(): void {
    this.tone(440, 220, 0, 0.2);
  }

  close(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
