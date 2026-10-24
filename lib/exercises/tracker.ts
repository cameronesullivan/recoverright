import {
  averageVisibility,
  facingRatio,
  kneeValgus,
  measure,
  metricLandmarks,
  nearSide,
  trunkLean,
  type PoseFrame,
} from "./pose";
import type { FormRule, Severity, Side, TrackedExerciseConfig } from "./tracking";

/**
 * Turns a stream of pose frames into reps, form feedback, and positioning
 * instructions for one exercise. Pure logic (no DOM), driven by the camera loop.
 */

export type FormStatus = "good" | "warning" | "stop";

export type Positioning = { ok: true; hint: string | null } | { ok: false; message: string };

export type TrackerEvent =
  | { type: "rep"; peak: number; durationMs: number }
  | { type: "partial"; peak: number; targetLowered: boolean }
  | { type: "formIssue"; rule: FormRule };

export interface TrackerSnapshot {
  positioning: Positioning;
  /** Smoothed angle of the tracked joint, in degrees. */
  value: number | null;
  side: Side | "both" | null;
  /** Landmark indices to draw larger (the tracked joint). */
  highlight: number[];
  /** Landmark to draw the live angle next to. */
  labelAt: number | null;
  status: FormStatus;
  /** On-screen form cue, if any. */
  cue: string | null;
  events: TrackerEvent[];
  /** Angle a rep currently has to reach (it can be lowered for limited range). */
  target: number;
}

const SMOOTHING = 0.4;
/** Degrees of movement away from the start that begins a rep. */
const MOVE_START = 8;
/** Smallest movement worth reporting as a short rep. */
const PARTIAL_MIN = 12;
/** A rep ends once the limb comes back at least this share of the way. */
const RETURN_SHARE = 0.65;
const GAP_RESET_MS = 600;
const RULE_ON_FRAMES = 5;
const RULE_OFF_FRAMES = 8;
const TRANSIENT_MS = 2500;
const POSITION_BAD_FRAMES = 12;
const POSITION_GOOD_FRAMES = 4;

interface RuleState {
  on: number;
  off: number;
  active: boolean;
}

export class ExerciseTracker {
  private readonly dir: 1 | -1;
  private targetSigned: number;
  private readonly startSigned: number;
  private readonly easiestSigned: number;

  private side: Side | "both" | null;
  private smoothed: number | null = null;
  private lastValidAt = -Infinity;

  private phase: "ready" | "moving" = "ready";
  private baseline: number | null = null;
  private peak = 0;
  private moveStartedAt = 0;
  private partialPeaks: number[] = [];

  private ruleStates = new Map<string, RuleState>();
  private transient: { rule: FormRule; until: number }[] = [];

  private positioning: Positioning = { ok: false, message: "Looking for you… step into view of the camera." };
  private goodFrames = 0;
  private badFrames = 0;
  /** True when the side was picked automatically (injured side unknown). */
  private readonly autoSide: boolean;

  constructor(
    readonly config: TrackedExerciseConfig,
    private readonly preferredSide: Side | null,
  ) {
    this.dir = config.rep.direction === "increase" ? 1 : -1;
    this.targetSigned = this.dir * config.rep.target;
    this.startSigned = this.dir * config.rep.start;
    this.easiestSigned = this.dir * config.rep.easiestTarget;
    this.side = config.side === "both" ? "both" : preferredSide;
    this.autoSide = config.side !== "both" && preferredSide === null;
  }

  /** Current rep target in degrees (may have been lowered). */
  get target(): number {
    return this.dir * this.targetSigned;
  }

  /** Call between sets. Keeps any lowered target so the next set counts the same way. */
  resetSet(): void {
    this.phase = "ready";
    this.baseline = null;
    this.partialPeaks = [];
    this.transient = [];
    this.ruleStates.clear();
  }

  update(frame: PoseFrame | null, now: number, counting: boolean): TrackerSnapshot {
    const events: TrackerEvent[] = [];
    this.transient = this.transient.filter((t) => t.until > now);
    // If an automatically chosen side has been out of view for a while, choose again.
    if (this.autoSide && this.side !== null && now - this.lastValidAt > 1500) this.side = null;

    const raw = frame ? this.readFrame(frame) : null;
    this.updatePositioning(frame, raw);

    let value: number | null = null;
    if (raw && this.positioning.ok) {
      if (this.smoothed === null || now - this.lastValidAt > GAP_RESET_MS) this.smoothed = raw.value;
      else this.smoothed = this.smoothed + SMOOTHING * (raw.value - this.smoothed);
      this.lastValidAt = now;
      value = this.smoothed;
    } else if (now - this.lastValidAt > GAP_RESET_MS) {
      this.smoothed = null;
      this.phase = "ready";
      this.baseline = null;
    }

    if (value !== null && frame) {
      if (counting) {
        this.countReps(value, now, events);
        this.checkFrameRules(frame, value, events);
      } else {
        this.phase = "ready";
        this.baseline = null;
      }
    }

    const { status, cue } = this.formStatus();
    const highlight = raw?.highlight ?? [];
    return {
      positioning: this.positioning,
      value,
      side: this.side,
      highlight,
      labelAt: highlight[0] ?? null,
      status,
      cue,
      events,
      target: this.target,
    };
  }

  // -------------------------------------------------------------------------

  private readFrame(frame: PoseFrame): { value: number; highlight: number[] } | null {
    const { metric, angleSpace } = this.config;
    if (this.side === "both") {
      const left = measure(frame, metric, "left", angleSpace);
      const right = measure(frame, metric, "right", angleSpace);
      const vertexL = metricLandmarks(metric, "left")[1];
      const vertexR = metricLandmarks(metric, "right")[1];
      if (left !== null && right !== null) {
        // Label the more-bent side, since that's the one people watch.
        const labelFirst = this.dir * left >= this.dir * right ? [vertexL, vertexR] : [vertexR, vertexL];
        return { value: (left + right) / 2, highlight: labelFirst };
      }
      if (left !== null) return { value: left, highlight: [vertexL] };
      if (right !== null) return { value: right, highlight: [vertexR] };
      return null;
    }

    if (this.side === null) this.side = this.pickSide(frame);
    if (this.side === null) return null;
    const value = measure(frame, metric, this.side, angleSpace);
    return value === null ? null : { value, highlight: [metricLandmarks(metric, this.side)[1]] };
  }

  /** When the injured side is unknown, track whichever side the camera sees best. */
  private pickSide(frame: PoseFrame): Side | null {
    const left = averageVisibility(frame, metricLandmarks(this.config.metric, "left"));
    const right = averageVisibility(frame, metricLandmarks(this.config.metric, "right"));
    if (Math.max(left, right) < 0.6) return null;
    return left >= right ? "left" : "right";
  }

  private updatePositioning(frame: PoseFrame | null, raw: { value: number } | null): void {
    let problem: string | null = null;
    let hint: string | null = null;
    const sideWord = this.side === "left" || this.side === "right" ? this.side : null;

    if (!frame) {
      problem = "We can't see you. Step into view and make sure the room is well lit.";
    } else {
      const ratio = facingRatio(frame);
      const sideOn = ratio !== null && ratio < 0.45;
      const facing = ratio !== null && ratio > 0.3;
      if (this.config.view === "side" && ratio !== null && !sideOn) {
        problem = sideWord ? `Turn your ${sideWord} side to the camera.` : "Turn your side to the camera.";
      } else if (this.config.view === "front" && ratio !== null && !facing) {
        if (this.config.angleSpace === "image") problem = "Face the camera.";
        else hint = "Face the camera so we can check your knees.";
      }
      if (!problem && !raw) problem = this.config.repositionHint;
      if (!problem && this.config.view === "side" && sideWord && this.preferredSide) {
        const near = nearSide(frame);
        if (near && near !== this.preferredSide) hint = `Turn around so your ${sideWord} side faces the camera.`;
      }
    }

    if (problem) {
      this.goodFrames = 0;
      this.badFrames++;
      if (!this.positioning.ok || this.badFrames >= POSITION_BAD_FRAMES) {
        this.positioning = { ok: false, message: problem };
      }
    } else {
      this.badFrames = 0;
      this.goodFrames++;
      if (this.positioning.ok || this.goodFrames >= POSITION_GOOD_FRAMES) {
        this.positioning = { ok: true, hint };
      }
    }
  }

  private countReps(value: number, now: number, events: TrackerEvent[]): void {
    const s = this.dir * value;
    if (this.baseline === null) {
      this.baseline = s;
      this.phase = "ready";
      return;
    }

    if (this.phase === "ready") {
      this.baseline = Math.min(this.baseline, s);
      if (s - this.baseline >= MOVE_START) {
        this.phase = "moving";
        this.peak = s;
        this.moveStartedAt = now;
      }
      return;
    }

    this.peak = Math.max(this.peak, s);
    // Back at the start position, or most of the way back toward where the rep began
    // (for people who can't fully reach the start position yet).
    const returned =
      (this.peak > this.startSigned && s <= this.startSigned) ||
      s <= this.peak - RETURN_SHARE * (this.peak - this.baseline);
    if (!returned) return;

    const excursion = this.peak - this.baseline;
    const peakValue = this.dir * this.peak;
    if (this.peak >= this.targetSigned) {
      const durationMs = now - this.moveStartedAt;
      events.push({ type: "rep", peak: peakValue, durationMs });
      this.partialPeaks = [];
      const fast = this.rule("tooFast");
      if (fast && fast.type === "tooFast" && durationMs < fast.minRepSeconds * 1000) {
        this.flagTransient(fast, now, events);
      }
    } else if (excursion >= PARTIAL_MIN) {
      this.partialPeaks.push(this.peak);
      let targetLowered = false;
      // After two short reps in a row, count reps at the range they can reach today.
      if (this.partialPeaks.length >= 2) {
        const reachable = Math.min(...this.partialPeaks.slice(-2)) - 3;
        const next = Math.max(this.easiestSigned, reachable);
        if (next < this.targetSigned) {
          this.targetSigned = next;
          targetLowered = true;
          this.partialPeaks = [];
        }
      }
      events.push({ type: "partial", peak: peakValue, targetLowered });
      const incompleteRule = this.rule("incompleteRange");
      if (incompleteRule && !targetLowered) this.flagTransient(incompleteRule, now, events);
    }
    this.phase = "ready";
    this.baseline = s;
  }

  private checkFrameRules(frame: PoseFrame, value: number, events: TrackerEvent[]): void {
    const trackedSides: Side[] =
      this.side === "both" ? ["left", "right"] : this.side ? [this.side] : [];
    for (const rule of this.config.rules) {
      let violated: boolean | null = null;
      switch (rule.type) {
        case "kneeValgus": {
          if (value < rule.minKneeBend) {
            violated = false;
            break;
          }
          const readings = trackedSides.map((side) => kneeValgus(frame, side)).filter((v) => v !== null);
          violated = readings.length ? Math.max(...readings) > rule.maxDegrees : null;
          break;
        }
        case "angleLimit": {
          if (value < rule.whenMainAbove) {
            violated = false;
            break;
          }
          const readings = trackedSides
            .map((side) => measure(frame, rule.metric, side, this.config.angleSpace))
            .filter((v) => v !== null);
          violated = readings.length ? Math.max(...readings) > rule.max : null;
          break;
        }
        case "trunkLean": {
          if (this.config.position === "lying") break;
          const lean = trunkLean(frame);
          violated = lean === null ? null : lean > rule.maxDegrees;
          break;
        }
        case "beyondRange":
          violated = this.dir * value > this.dir * rule.max;
          break;
        default:
          break;
      }
      if (violated === null) continue;
      this.stepRule(rule, violated, events);
    }
  }

  private stepRule(rule: FormRule, violated: boolean, events: TrackerEvent[]): void {
    const state = this.ruleStates.get(rule.id) ?? { on: 0, off: 0, active: false };
    if (violated) {
      state.on++;
      state.off = 0;
      if (!state.active && state.on >= RULE_ON_FRAMES) {
        state.active = true;
        events.push({ type: "formIssue", rule });
      }
    } else {
      state.off++;
      state.on = 0;
      if (state.active && state.off >= RULE_OFF_FRAMES) state.active = false;
    }
    this.ruleStates.set(rule.id, state);
  }

  private flagTransient(rule: FormRule, now: number, events: TrackerEvent[]): void {
    this.transient = this.transient.filter((t) => t.rule.id !== rule.id);
    this.transient.push({ rule, until: now + TRANSIENT_MS });
    events.push({ type: "formIssue", rule });
  }

  private rule(type: FormRule["type"]): FormRule | undefined {
    return this.config.rules.find((r) => r.type === type);
  }

  private formStatus(): { status: FormStatus; cue: string | null } {
    const active: FormRule[] = [
      ...this.config.rules.filter((r) => this.ruleStates.get(r.id)?.active),
      ...this.transient.map((t) => t.rule),
    ];
    if (active.length === 0) return { status: "good", cue: null };
    const rank = (s: Severity) => (s === "stop" ? 2 : 1);
    const worst = active.reduce((a, b) => (rank(b.severity) > rank(a.severity) ? b : a));
    return { status: worst.severity === "stop" ? "stop" : "warning", cue: worst.cue };
  }
}
