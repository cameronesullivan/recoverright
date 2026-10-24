import type { CoachApiResponse } from "@/lib/api-types";
import type { PoseFrame } from "@/lib/exercises/pose";
import {
  REST_BETWEEN_SETS_SECONDS,
  buildStep,
  type GuidedSession,
  type SessionExerciseResult,
  type SessionStep,
} from "@/lib/exercises/session";
import { ExerciseTracker, type FormStatus, type Positioning } from "@/lib/exercises/tracker";
import { JOINT_METRICS, type FormRule, type Side } from "@/lib/exercises/tracking";
import type { ChatMessage, Exercise } from "@/lib/plan-schema";
import { Beeper } from "./beeper";
import type { DrawOptions } from "./drawPose";

/**
 * Runs a guided session: exercise order, sets, timers, rep counting from camera
 * frames, beeps, coach messages, and the final saved record. It lives outside
 * React so the camera loop and timers don't depend on re-renders; the UI
 * subscribes with useSyncExternalStore.
 */

export type RunStage =
  | { kind: "exercise-intro" }
  | { kind: "get-ready"; endsAt: number }
  | { kind: "active"; startedAt: number }
  | { kind: "rest"; endsAt: number }
  | { kind: "pain-check" }
  | { kind: "stopped"; trigger: "hurt" | "pain" }
  | { kind: "summary" };

export interface TimerView {
  label: string;
  /** Seconds left in the current hold, relax, or continuous timer. */
  secondsLeft: number;
  /** 0–1 progress through the current hold or rep. */
  progress: number;
  phase: "hold" | "relax" | "move" | "return" | "continuous";
}

export interface CoachMessage {
  text: string;
  source: "ai" | "local";
}

export type SaveState = "idle" | "saving" | "saved" | "nothing" | "error";

export interface SessionSnapshot {
  stage: RunStage;
  index: number;
  setNumber: number;
  steps: SessionStep[];
  results: SessionExerciseResult[];
  useCamera: boolean;
  paused: boolean;
  muted: boolean;
  repsThisSet: number;
  /** Countdown for get-ready and rest stages. */
  secondsLeft: number | null;
  timer: TimerView | null;
  positioning: Positioning | null;
  formStatus: FormStatus;
  cue: string | null;
  angle: number | null;
  /** Angle a rep needs to reach right now (camera exercises). */
  repTarget: number | null;
  coach: CoachMessage | null;
  coachBusy: boolean;
  coachOffline: boolean;
  /** Recent questions and answers (session events are hidden). */
  qa: ChatMessage[];
  typing: boolean;
  save: SaveState;
  saveError: string | null;
  session: GuidedSession | null;
}

export interface SessionOptions {
  exercises: Exercise[];
  useCamera: boolean;
  /** Injured side from the diagnosis, if known. */
  side: Side | null;
  week: number;
  phaseName: string;
  save: (session: GuidedSession) => Promise<void>;
}

const GET_READY_CAMERA_MS = 5000;
const GET_READY_MS = 3000;
const REST_MS = REST_BETWEEN_SETS_SECONDS * 1000;
const FORM_AI_GAP_MS = 25_000;
const COACH_TIMEOUT_MS = 15_000;
/** The coach only receives this many recent messages. */
const COACH_CONTEXT = 6;
const MAX_QUESTION = 300;

const NO_DRAW: DrawOptions = { status: "good", highlight: [], labelAt: null, label: null };

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type CoachItem = { content: string; kind: "event" | "question" };

export class SessionController {
  private readonly listeners = new Set<() => void>();
  private readonly beeper = new Beeper();
  private readonly id = newId();
  private readonly startedAt = new Date().toISOString();
  private readonly options: SessionOptions;

  private steps: SessionStep[];
  private results: SessionExerciseResult[];
  /** Exercises that were stopped because of pain. */
  private stopped: boolean[];
  private stage: RunStage = { kind: "exercise-intro" };
  private index = 0;
  private setNumber = 1;
  private repsThisSet = 0;
  private paused = false;
  private typing = false;
  private useCamera: boolean;
  private tracker: ExerciseTracker | null = null;

  // Pausable session clock (ms).
  private clock = 0;
  private lastTick: number | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastCountdownSecond: number | null = null;
  private lastTimerKey = "";

  // Latest camera feedback.
  private positioning: Positioning | null = null;
  private formStatus: FormStatus = "good";
  private cue: string | null = null;
  private angle: number | null = null;
  private trackedSide: Side | "both" | null = null;
  private dirty = false;

  // Coach.
  private transcript: ChatMessage[] = [];
  private qa: ChatMessage[] = [];
  private coach: CoachMessage | null = null;
  private localSeq = 0;
  private coachBusy = false;
  private coachQueue: CoachItem[] = [];
  private coachOffline = false;
  private lastFormAiAt = -Infinity;
  private formAiSent = new Set<string>();
  private setIssues = new Map<string, number>();

  private saveState: SaveState = "idle";
  private saveError: string | null = null;
  private session: GuidedSession | null = null;
  private disposed = false;
  private snapshot: SessionSnapshot;

  constructor(options: SessionOptions) {
    this.options = options;
    this.useCamera = options.useCamera;
    this.steps = options.exercises.map((e) => buildStep(e, options.useCamera));
    this.results = this.steps.map((step) => this.emptyResult(step));
    this.stopped = this.steps.map(() => false);
    this.createTracker();
    this.snapshot = this.build();
  }

  // --- Store API (useSyncExternalStore) -------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  private emit(): void {
    if (this.disposed) return;
    this.snapshot = this.build();
    this.dirty = false;
    for (const listener of this.listeners) listener();
  }

  // --- Lifecycle -------------------------------------------------------------

  /** Start the session clock. Safe to call again after detach(). */
  attach(): void {
    if (this.interval !== null || this.disposed) return;
    this.lastTick = performance.now();
    this.interval = setInterval(() => this.tick(), 100);
  }

  /** Stop the clock (for example when the page is hidden). Pauses an active session. */
  detach(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
    this.lastTick = null;
    if (this.stage.kind !== "summary" && this.stage.kind !== "exercise-intro") this.paused = true;
    this.emit();
  }

  dispose(): void {
    this.detach();
    this.disposed = true;
    this.beeper.close();
    this.listeners.clear();
  }

  // --- User actions ----------------------------------------------------------

  /** "Ready" on the exercise intro screen. */
  ready(): void {
    this.beeper.unlock();
    if (this.stage.kind !== "exercise-intro") return;
    this.paused = false;
    this.startGetReady(this.currentStep?.mode === "camera" ? GET_READY_CAMERA_MS : GET_READY_MS);
  }

  /** Skip the rest of the rest period. */
  startNextSetNow(): void {
    this.beeper.unlock();
    if (this.stage.kind !== "rest") return;
    this.paused = false;
    this.startGetReady(GET_READY_MS);
  }

  togglePause(): void {
    this.beeper.unlock();
    if (this.stage.kind === "summary") return;
    this.paused = !this.paused;
    this.emit();
  }

  pause(): void {
    if (this.paused || this.stage.kind === "summary" || this.stage.kind === "exercise-intro") return;
    this.paused = true;
    this.emit();
  }

  toggleMute(): void {
    this.beeper.unlock();
    this.beeper.muted = !this.beeper.muted;
    this.emit();
  }

  setTyping(typing: boolean): void {
    this.typing = typing;
    this.emit();
  }

  /** Count the set as done now, even if fewer reps were counted. */
  finishSet(): void {
    if (this.stage.kind !== "active") return;
    this.completeSet();
  }

  skipExercise(): void {
    if (this.stage.kind === "summary" || this.stage.kind === "pain-check" || this.stage.kind === "stopped") return;
    const result = this.currentResult;
    if (result && result.repsCompleted > 0) {
      // They did some of it, so still ask how it felt.
      this.stage = { kind: "pain-check" };
      this.emit();
      return;
    }
    this.nextExercise();
  }

  /** "That hurts": stop this exercise right away. */
  hurt(): void {
    const kind = this.stage.kind;
    if (kind !== "active" && kind !== "get-ready" && kind !== "rest") return;
    const step = this.currentStep;
    const result = this.currentResult;
    if (!step || !result) return;
    result.hurtReported = true;
    this.stopped[this.index] = true;
    const progress = step.mode === "camera" || step.mode === "paced" ? ` (rep ${this.repsThisSet} of ${step.dosage.reps})` : "";
    this.coachEvent(
      `Event: the person tapped "That hurts" during ${step.exercise.name}, set ${this.setNumber}${progress}. The exercise was stopped.`,
      "milestone",
    );
    this.showLocal("Let's stop this exercise for now. Rest, and only try the easier version if it feels OK.");
    this.stage = { kind: "stopped", trigger: "hurt" };
    this.paused = false;
    this.emit();
  }

  /** Pain score (0–10) after an exercise, or on the stop screen. */
  setPain(score: number): void {
    const step = this.currentStep;
    const result = this.currentResult;
    if (!step || !result) return;
    result.painScore = Math.max(0, Math.min(10, Math.round(score)));

    if (this.stage.kind === "stopped") {
      this.emit();
      return;
    }
    if (this.stage.kind !== "pain-check") return;

    if (result.painScore >= 7) {
      this.stopped[this.index] = true;
      this.coachEvent(
        `Event: pain ${result.painScore}/10 reported after ${step.exercise.name}. The exercise was stopped.`,
        "milestone",
      );
      this.showLocal("Pain of 7 or more is a sign to stop. Rest now, and contact your physical therapist if it continues.");
      this.stage = { kind: "stopped", trigger: "pain" };
      this.emit();
      return;
    }
    this.coachEvent(this.exerciseFinishedEvent(), "milestone");
    this.showLocal(
      result.painScore >= 4
        ? "Thanks for checking in. Keep movements gentle, and mention this pain level to your physical therapist."
        : `Nice job finishing ${step.exercise.name}.`,
    );
    this.nextExercise();
  }

  /** Leave the stop screen and move on. */
  continueAfterStop(): void {
    if (this.stage.kind !== "stopped") return;
    this.nextExercise();
  }

  endSession(): void {
    if (this.stage.kind === "summary") return;
    this.finish();
  }

  ask(question: string): void {
    const text = question.trim().slice(0, MAX_QUESTION);
    if (!text) return;
    this.enqueueCoach({ content: text, kind: "question" });
  }

  /** The camera stopped working: carry on with timers. */
  disableCamera(): void {
    if (!this.useCamera) return;
    this.useCamera = false;
    for (let i = this.index; i < this.steps.length; i++) {
      this.steps[i] = buildStep(this.steps[i].exercise, false);
      this.results[i] = { ...this.results[i], mode: this.steps[i].mode };
    }
    this.tracker = null;
    this.positioning = null;
    this.cue = null;
    if (this.stage.kind === "active" || this.stage.kind === "get-ready") {
      this.stage = { kind: "exercise-intro" };
      this.repsThisSet = 0;
    }
    this.emit();
  }

  // --- Camera frames ---------------------------------------------------------

  handleFrame = (frame: PoseFrame | null, timestamp: number): DrawOptions => {
    const step = this.currentStep;
    if (!this.tracker || !step || step.mode !== "camera" || this.disposed) return NO_DRAW;

    const counting = this.stage.kind === "active" && !this.paused;
    const snap = this.tracker.update(frame, timestamp, counting);
    if (snap.side) this.trackedSide = snap.side;

    for (const event of snap.events) {
      if (this.stage.kind !== "active") break;
      if (event.type === "rep") {
        this.addRep(event.peak, false);
        if (this.repsThisSet >= step.dosage.reps) this.completeSet();
        else this.emit();
      } else if (event.type === "partial" && event.targetLowered) {
        this.showLocal("Counting reps at your current range today. Only go as far as is comfortable.");
      } else if (event.type === "formIssue") {
        this.onFormIssue(event.rule);
      }
    }

    const angle = snap.value === null ? null : Math.round(snap.value);
    if (
      !samePositioning(this.positioning, snap.positioning) ||
      snap.cue !== this.cue ||
      snap.status !== this.formStatus ||
      angle !== this.angle
    ) {
      this.positioning = snap.positioning;
      this.cue = snap.cue;
      this.formStatus = snap.status;
      this.angle = angle;
      this.dirty = true;
    }

    return {
      status: this.stage.kind === "stopped" ? "stop" : snap.status,
      highlight: snap.highlight,
      labelAt: snap.labelAt,
      label: angle === null ? null : `${angle}°`,
    };
  };

  // --- Internals -------------------------------------------------------------

  private get currentStep(): SessionStep | undefined {
    return this.steps[this.index];
  }

  private get currentResult(): SessionExerciseResult | undefined {
    return this.results[this.index];
  }

  private emptyResult(step: SessionStep): SessionExerciseResult {
    const { sets, reps } = step.dosage;
    return {
      name: step.exercise.name,
      mode: step.mode,
      trackingId: step.tracking?.id ?? null,
      metric: step.tracking?.metric ?? null,
      side: step.tracking ? (step.tracking.side === "both" ? "both" : this.options.side) : null,
      status: "skipped",
      setsTarget: sets,
      setsCompleted: 0,
      repsTarget: sets * reps,
      repsCompleted: 0,
      bestAngle: null,
      targetRange: step.tracking?.targetRange ?? null,
      painScore: null,
      hurtReported: false,
      formIssues: [],
    };
  }

  private createTracker(): void {
    const step = this.currentStep;
    this.tracker = step?.mode === "camera" && step.tracking ? new ExerciseTracker(step.tracking, this.options.side) : null;
    this.positioning = null;
    this.cue = null;
    this.angle = null;
    this.formStatus = "good";
    this.trackedSide = null;
  }

  private tick(): void {
    const now = performance.now();
    if (this.lastTick !== null && !this.paused) this.clock += now - this.lastTick;
    this.lastTick = now;
    this.advance();
    const timed = this.stage.kind === "get-ready" || this.stage.kind === "rest" || this.stage.kind === "active";
    if (this.dirty || timed) this.emit();
  }

  private advance(): void {
    const stage = this.stage;
    if (this.paused) return;
    if (stage.kind === "get-ready") {
      const left = stage.endsAt - this.clock;
      this.countdownBeeps(left);
      if (left <= 0) this.beginSet();
    } else if (stage.kind === "rest") {
      if (this.typing) return;
      const left = stage.endsAt - this.clock;
      this.countdownBeeps(left);
      if (left <= 0) this.startGetReady(GET_READY_MS);
    } else if (stage.kind === "active") {
      this.advanceTimedSet(stage.startedAt);
    }
  }

  private countdownBeeps(leftMs: number): void {
    const second = Math.ceil(leftMs / 1000);
    if (second !== this.lastCountdownSecond && second >= 1 && second <= 3) this.beeper.tick();
    this.lastCountdownSecond = second;
  }

  private startGetReady(ms: number): void {
    this.stage = { kind: "get-ready", endsAt: this.clock + ms };
    this.lastCountdownSecond = null;
    this.emit();
  }

  private beginSet(): void {
    this.beeper.go();
    this.stage = { kind: "active", startedAt: this.clock };
    this.repsThisSet = 0;
    this.setIssues.clear();
    this.lastTimerKey = "";
    this.tracker?.resetSet();
    const step = this.currentStep;
    if (step?.mode === "camera") this.showLocal("Move slowly and smoothly. I'll count each rep.");
    this.emit();
  }

  private advanceTimedSet(startedAt: number): void {
    const step = this.currentStep;
    if (!step || step.mode === "camera") return;
    const elapsed = this.clock - startedAt;
    const { reps } = step.dosage;

    if (step.mode === "paced") {
      const count = Math.min(reps, Math.floor(elapsed / (step.repSeconds * 1000)));
      while (this.repsThisSet < count) this.addRep(null, false);
      if (this.repsThisSet >= reps) this.completeSet();
      return;
    }

    if (step.mode === "duration") {
      if (elapsed >= (step.dosage.holdSeconds ?? 0) * 1000) {
        this.addRep(null, true);
        this.completeSet();
      }
      return;
    }

    // Holds: hold, relax, hold, relax… (no relax after the last hold).
    const hold = (step.dosage.holdSeconds ?? 5) * 1000;
    const relax = step.relaxSeconds * 1000;
    const cycle = hold + relax;
    const total = reps * cycle - relax;
    const i = Math.min(reps - 1, Math.floor(elapsed / cycle));
    const inHold = elapsed - i * cycle < hold;
    const key = `${i}:${inHold ? "hold" : "relax"}`;
    if (key !== this.lastTimerKey) {
      if (this.lastTimerKey !== "") {
        if (inHold) this.beeper.go();
        else this.beeper.relax();
      }
      this.lastTimerKey = key;
    }
    const holdsDone = elapsed >= total ? reps : inHold ? i : i + 1;
    while (this.repsThisSet < holdsDone) this.addRep(null, true);
    if (elapsed >= total) this.completeSet();
  }

  private addRep(peak: number | null, silent: boolean): void {
    const result = this.currentResult;
    const step = this.currentStep;
    if (!result || !step) return;
    this.repsThisSet++;
    result.repsCompleted++;
    if (peak !== null && step.tracking) {
      const higher = JOINT_METRICS[step.tracking.metric].higherIsBetter;
      const rounded = Math.round(peak);
      if (result.bestAngle === null || (higher ? rounded > result.bestAngle : rounded < result.bestAngle)) {
        result.bestAngle = rounded;
      }
      if (this.trackedSide) result.side = this.trackedSide;
    }
    if (!silent) this.beeper.rep();
    this.dirty = true;
  }

  private completeSet(): void {
    const step = this.currentStep;
    const result = this.currentResult;
    if (!step || !result) return;
    this.beeper.setComplete();
    result.setsCompleted++;
    if (this.setNumber < step.dosage.sets) {
      // The last set skips this call; the "exercise finished" event covers it.
      this.coachEvent(this.setCompleteEvent(), "milestone");
      this.showLocal(`Set ${this.setNumber} done. Nice work! Rest for ${REST_BETWEEN_SETS_SECONDS} seconds.`);
      this.setNumber++;
      this.stage = { kind: "rest", endsAt: this.clock + REST_MS };
      this.lastCountdownSecond = null;
    } else {
      this.showLocal(`That's the last set of ${step.exercise.name}. Well done!`);
      this.stage = { kind: "pain-check" };
    }
    this.emit();
  }

  private nextExercise(): void {
    this.index++;
    this.setNumber = 1;
    this.repsThisSet = 0;
    this.paused = false;
    if (this.index >= this.steps.length) {
      this.index = this.steps.length - 1;
      this.finish();
      return;
    }
    this.createTracker();
    this.stage = { kind: "exercise-intro" };
    this.emit();
  }

  private finish(): void {
    this.stage = { kind: "summary" };
    this.paused = false;
    this.tracker = null;
    this.results = this.results.map((r, i) => ({
      ...r,
      status: this.stopped[i]
        ? "stopped"
        : r.setsCompleted >= r.setsTarget
          ? "completed"
          : r.repsCompleted > 0
            ? "partial"
            : "skipped",
    }));
    const attempted = this.results.some((r) => r.repsCompleted > 0 || r.painScore !== null || r.status === "stopped");
    const session: GuidedSession = {
      id: this.id,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      planWeek: this.options.week,
      phaseName: this.options.phaseName.slice(0, 200),
      usedCamera: this.options.useCamera,
      exercises: this.results.map((r) => ({ ...r, formIssues: r.formIssues.map((f) => ({ ...f })) })),
    };
    this.session = session;
    if (!attempted) {
      this.saveState = "nothing";
      this.emit();
      return;
    }
    this.saveState = "saving";
    this.emit();
    this.options
      .save(session)
      .then(() => {
        this.saveState = "saved";
      })
      .catch((error: unknown) => {
        this.saveState = "error";
        this.saveError = error instanceof Error ? error.message : "This session couldn't be saved.";
      })
      .finally(() => this.emit());
  }

  private onFormIssue(rule: FormRule): void {
    const step = this.currentStep;
    const result = this.currentResult;
    if (!step || !result) return;
    const existing = result.formIssues.find((f) => f.id === rule.id);
    if (existing) existing.count++;
    else result.formIssues.push({ id: rule.id, label: rule.label, cue: rule.cue, count: 1 });
    this.setIssues.set(rule.label, (this.setIssues.get(rule.label) ?? 0) + 1);

    const key = `${this.index}:${rule.id}`;
    if (!this.formAiSent.has(key) && this.clock - this.lastFormAiAt > FORM_AI_GAP_MS && !this.coachBusy) {
      this.formAiSent.add(key);
      this.lastFormAiAt = this.clock;
      this.coachEvent(
        `Event: form issue during ${step.exercise.name}, set ${this.setNumber}, rep ${this.repsThisSet + 1} of ${step.dosage.reps}: ${rule.label}.`,
        "form",
      );
    }
    this.dirty = true;
  }

  // --- Coach -----------------------------------------------------------------

  private showLocal(text: string): void {
    this.coach = { text, source: "local" };
    this.localSeq++;
    this.dirty = true;
  }

  private coachEvent(content: string, kind: "milestone" | "form"): void {
    if (kind === "form" && this.coachBusy) return;
    this.enqueueCoach({ content: content.slice(0, 780), kind: "event" });
  }

  private enqueueCoach(item: CoachItem): void {
    if (this.coachBusy) {
      this.coachQueue.push(item);
      // Keep the queue short; questions are never dropped.
      while (this.coachQueue.length > 3) {
        const dropAt = this.coachQueue.findIndex((q) => q.kind === "event");
        if (dropAt === -1) break;
        this.coachQueue.splice(dropAt, 1);
      }
      this.emit();
      return;
    }
    void this.sendCoach(item);
  }

  private async sendCoach(item: CoachItem): Promise<void> {
    this.coachBusy = true;
    const userMessage: ChatMessage = { role: "user", content: item.content };
    this.transcript = [...this.transcript, userMessage].slice(-20);
    if (item.kind === "question") this.qa = [...this.qa, userMessage].slice(-6);
    const seq = this.localSeq;
    this.emit();

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), COACH_TIMEOUT_MS);
    let reply: string | null = null;
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercises: this.steps.map((s) => ({
            name: s.exercise.name.slice(0, 160),
            sets: s.exercise.sets.slice(0, 60),
            reps: s.exercise.reps.slice(0, 120),
          })),
          messages: this.transcript.slice(-COACH_CONTEXT),
        }),
        signal: abort.signal,
      });
      const data = (await response.json()) as CoachApiResponse;
      if (data.status === "ok" && data.reply.trim()) reply = data.reply.trim();
    } catch {
      // Offline, timed out, or the server is down. The session carries on.
    } finally {
      clearTimeout(timer);
    }
    if (this.disposed) return;

    if (reply) {
      const assistant: ChatMessage = { role: "assistant", content: reply.slice(0, 800) };
      this.transcript = [...this.transcript, assistant].slice(-20);
      this.coachOffline = false;
      if (item.kind === "question") {
        this.qa = [...this.qa, assistant].slice(-6);
        this.coach = { text: reply, source: "ai" };
        this.localSeq++;
      } else if (this.localSeq === seq || this.coach?.source === "local") {
        this.coach = { text: reply, source: "ai" };
      }
    } else {
      this.coachOffline = true;
      if (item.kind === "question") {
        const fallback =
          "The coach is offline right now, but rep counting still works. Save your question for your physical therapist.";
        this.qa = [...this.qa, { role: "assistant" as const, content: fallback }].slice(-6);
        this.coach = { text: fallback, source: "local" };
      }
    }
    this.coachBusy = false;
    this.emit();
    const next = this.coachQueue.shift();
    if (next) void this.sendCoach(next);
  }

  private trackedJointText(): string | null {
    const step = this.currentStep;
    const result = this.currentResult;
    if (!step?.tracking || !result || result.bestAngle === null) return null;
    const metric = JOINT_METRICS[step.tracking.metric];
    const side = result.side === "left" || result.side === "right" ? `${result.side} ` : "";
    const { min, max } = step.tracking.targetRange;
    return `Best ${side}${metric.label}: ${result.bestAngle}° (typical target ${min}–${max}°).`;
  }

  private issuesText(entries: [string, number][]): string {
    return entries.length ? entries.map(([label, count]) => `${label} (${count}x)`).join(", ") : "none";
  }

  private setCompleteEvent(): string {
    const step = this.currentStep!;
    const { sets, reps, holdSeconds } = step.dosage;
    const work =
      step.mode === "hold"
        ? `${this.repsThisSet} holds of ${holdSeconds} seconds`
        : `${this.repsThisSet}/${reps} reps${step.mode === "paced" ? " (timed, no camera)" : ""}`;
    return [
      `Event: set ${this.setNumber} of ${sets} complete for ${step.exercise.name}: ${work}.`,
      this.trackedJointText(),
      step.mode === "camera" ? `Form issues this set: ${this.issuesText([...this.setIssues])}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  private exerciseFinishedEvent(): string {
    const step = this.currentStep!;
    const result = this.currentResult!;
    return [
      `Event: finished ${step.exercise.name}: ${result.setsCompleted}/${result.setsTarget} sets, ${result.repsCompleted} reps.`,
      this.trackedJointText(),
      `Pain after the exercise: ${result.painScore ?? "not given"}/10.`,
      step.mode === "camera"
        ? `Form issues: ${this.issuesText(result.formIssues.map((f) => [f.label, f.count]))}.`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // --- Snapshot --------------------------------------------------------------

  private build(): SessionSnapshot {
    const stage = this.stage;
    const step = this.currentStep;
    let secondsLeft: number | null = null;
    if (stage.kind === "get-ready" || stage.kind === "rest") {
      secondsLeft = Math.max(0, Math.ceil((stage.endsAt - this.clock) / 1000));
    }
    const timer = stage.kind === "active" && step && step.mode !== "camera" ? this.timerView(step, this.clock - stage.startedAt) : null;
    return {
      stage,
      index: this.index,
      setNumber: this.setNumber,
      steps: this.steps,
      results: this.results.map((r) => ({ ...r, formIssues: r.formIssues.map((f) => ({ ...f })) })),
      useCamera: this.useCamera,
      paused: this.paused,
      muted: this.beeper.muted,
      repsThisSet: this.repsThisSet,
      secondsLeft,
      timer,
      positioning: this.positioning,
      formStatus: this.formStatus,
      cue: this.cue,
      angle: this.angle,
      repTarget: this.tracker ? Math.round(this.tracker.target) : null,
      coach: this.coach,
      coachBusy: this.coachBusy,
      coachOffline: this.coachOffline,
      qa: this.qa,
      typing: this.typing,
      save: this.saveState,
      saveError: this.saveError,
      session: this.session,
    };
  }

  private timerView(step: SessionStep, elapsed: number): TimerView {
    if (step.mode === "paced") {
      const per = step.repSeconds * 1000;
      const progress = (elapsed % per) / per;
      return {
        label: progress < 0.5 ? "Move slowly…" : "…and back",
        secondsLeft: Math.ceil((per - (elapsed % per)) / 1000),
        progress,
        phase: progress < 0.5 ? "move" : "return",
      };
    }
    if (step.mode === "duration") {
      const total = (step.dosage.holdSeconds ?? 0) * 1000;
      return {
        label: "Time left",
        secondsLeft: Math.max(0, (total - elapsed) / 1000),
        progress: total ? Math.min(1, elapsed / total) : 1,
        phase: "continuous",
      };
    }
    const hold = (step.dosage.holdSeconds ?? 5) * 1000;
    const relax = step.relaxSeconds * 1000;
    const cycle = hold + relax;
    const i = Math.min(step.dosage.reps - 1, Math.floor(elapsed / cycle));
    const within = elapsed - i * cycle;
    const inHold = within < hold;
    return {
      label: inHold ? "Hold" : "Relax",
      secondsLeft: Math.max(0, inHold ? (hold - within) / 1000 : (cycle - within) / 1000),
      progress: inHold ? within / hold : (within - hold) / relax,
      phase: inHold ? "hold" : "relax",
    };
  }
}

function samePositioning(a: Positioning | null, b: Positioning): boolean {
  if (!a || a.ok !== b.ok) return false;
  return a.ok ? a.hint === (b as { hint: string | null }).hint : a.message === (b as { message: string }).message;
}
