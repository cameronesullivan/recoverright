import { z } from "zod";
import { PLAN_WEEKS } from "../dates";
import type { Exercise, Phase, RecoveryPlan } from "../plan-schema";
import { classifyExercise, type ExerciseMode, type Side, type TrackedExerciseConfig } from "./tracking";

/**
 * Guided session building blocks: turning today's plan exercises into session
 * steps, estimating length, and the saved session record.
 */

// ---------------------------------------------------------------------------
// Saved session record (stored with the plan via lib/storage.ts)
// ---------------------------------------------------------------------------

export const SessionExerciseResultSchema = z.object({
  name: z.string().max(200),
  mode: z.enum(["camera", "paced", "hold", "duration"]),
  trackingId: z.string().max(60).nullable(),
  metric: z.string().max(60).nullable(),
  side: z.enum(["left", "right", "both"]).nullable(),
  status: z.enum(["completed", "partial", "skipped", "stopped"]),
  setsTarget: z.number().int().min(0).max(20),
  setsCompleted: z.number().int().min(0).max(20),
  repsTarget: z.number().int().min(0).max(1000),
  repsCompleted: z.number().int().min(0).max(1000),
  /** Best angle reached in a counted rep (degrees), camera mode only. */
  bestAngle: z.number().min(-10).max(200).nullable(),
  targetRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  painScore: z.number().int().min(0).max(10).nullable(),
  hurtReported: z.boolean(),
  formIssues: z.array(
    z.object({ id: z.string().max(60), label: z.string().max(120), cue: z.string().max(300), count: z.number().int().min(1) }),
  ),
});

export const GuidedSessionSchema = z.object({
  id: z.string().min(1).max(80),
  startedAt: z.string(),
  endedAt: z.string(),
  planWeek: z.number().int().min(1).max(PLAN_WEEKS),
  phaseName: z.string().max(200),
  usedCamera: z.boolean(),
  exercises: z.array(SessionExerciseResultSchema).max(20),
});

export type SessionExerciseResult = z.infer<typeof SessionExerciseResultSchema>;
export type GuidedSession = z.infer<typeof GuidedSessionSchema>;

// ---------------------------------------------------------------------------
// Session steps
// ---------------------------------------------------------------------------

export interface Dosage {
  sets: number;
  /** Reps (or holds) per set. */
  reps: number;
  hasRepCount: boolean;
  /** Seconds per hold, or total seconds for continuous timers. */
  holdSeconds: number | null;
}

export interface SessionStep {
  exercise: Exercise;
  mode: ExerciseMode;
  tracking: TrackedExerciseConfig | null;
  dosage: Dosage;
  /** Seconds of relaxing between holds. */
  relaxSeconds: number;
  /** Seconds per rep when the app paces reps with a timer. */
  repSeconds: number;
}

export const REST_BETWEEN_SETS_SECONDS = 30;
const DEFAULT_REPS = 10;
const DEFAULT_SETS = 2;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function firstNumber(text: string): number | null {
  const m = text.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Read sets, reps, and hold time from the plan's free-text dosage. Uses the lower end of ranges. */
export function parseDosage(exercise: Pick<Exercise, "sets" | "reps">): Dosage {
  const sets = clamp(Math.round(firstNumber(exercise.sets) ?? DEFAULT_SETS), 1, 6);
  const text = exercise.reps.toLowerCase();

  let holdSeconds: number | null = null;
  const duration = text.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*\d+(?:\.\d+)?\s*)?(seconds?|secs?|s\b|minutes?|mins?|min\b)/);
  if (duration) {
    const n = Number(duration[1]);
    holdSeconds = clamp(Math.round(duration[2].startsWith("m") ? n * 60 : n), 3, 1800);
  }

  let reps: number | null = null;
  const repMatch = text.match(/(\d+)\s*(?:(?:-|–|—|to)\s*\d+\s*)?(reps?|repetitions?|times|x\b|holds?)/);
  if (repMatch) reps = Number(repMatch[1]);
  else if (/^\s*\d+\s*((-|–|—|to)\s*\d+)?\s*$/.test(text)) reps = firstNumber(text);

  return {
    sets,
    reps: clamp(reps ?? (holdSeconds !== null ? 1 : DEFAULT_REPS), 1, 30),
    hasRepCount: reps !== null,
    holdSeconds,
  };
}

export function buildStep(exercise: Exercise, useCamera: boolean): SessionStep {
  const dosage = parseDosage(exercise);
  const { mode, tracking } = classifyExercise(exercise.name, dosage);
  const finalMode: ExerciseMode = mode === "camera" && !useCamera ? "paced" : mode;
  if (finalMode === "duration" && dosage.holdSeconds === null) dosage.holdSeconds = 15 * 60;
  if (finalMode === "hold" && dosage.holdSeconds === null) dosage.holdSeconds = 5;
  if (finalMode === "duration") {
    dosage.reps = 1;
    dosage.sets = 1;
  }
  const hold = dosage.holdSeconds ?? 0;
  return {
    exercise,
    mode: finalMode,
    tracking: finalMode === "camera" ? tracking : null,
    dosage,
    relaxSeconds: clamp(Math.round(hold / 2), 3, 10),
    repSeconds: tracking?.repSeconds ?? 4,
  };
}

/** True when this exercise could use the camera (if the person allows it). */
export function canUseCamera(exercise: Exercise): boolean {
  return classifyExercise(exercise.name, parseDosage(exercise)).mode === "camera";
}

export function stepSeconds(step: SessionStep): number {
  const { sets, reps } = step.dosage;
  const rest = (sets - 1) * REST_BETWEEN_SETS_SECONDS;
  const setup = 45;
  switch (step.mode) {
    case "camera":
    case "paced":
      return sets * reps * step.repSeconds + rest + setup;
    case "hold": {
      const hold = step.dosage.holdSeconds ?? 5;
      return sets * (reps * (hold + step.relaxSeconds) - step.relaxSeconds) + rest + setup;
    }
    case "duration":
      return (step.dosage.holdSeconds ?? 0) + 30;
  }
}

export function estimateMinutes(steps: SessionStep[]): number {
  return Math.max(1, Math.round(steps.reduce((sum, s) => sum + stepSeconds(s), 0) / 60));
}

export function describeDosage(step: SessionStep): string {
  const { sets, reps, holdSeconds } = step.dosage;
  const setWord = sets === 1 ? "set" : "sets";
  switch (step.mode) {
    case "camera":
    case "paced":
      return `${sets} ${setWord} × ${reps} reps`;
    case "hold":
      return reps === 1
        ? `${sets} ${setWord} × hold ${formatSeconds(holdSeconds ?? 5)}`
        : `${sets} ${setWord} × ${reps} holds of ${formatSeconds(holdSeconds ?? 5)}`;
    case "duration":
      return formatSeconds(holdSeconds ?? 0);
  }
}

export function formatSeconds(total: number): string {
  if (total < 60) return `${total} seconds`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${minutes} min ${seconds} s`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Today's session
// ---------------------------------------------------------------------------

export interface TodaysSession {
  phase: Phase;
  phaseIndex: number;
  week: number;
}

/** The phase that matches the person's current week (last phase once the 20 weeks are over). */
export function todaysPhase(plan: RecoveryPlan, currentWeek: number): TodaysSession | null {
  if (plan.phases.length === 0) return null;
  const week = Math.min(PLAN_WEEKS, Math.max(1, currentWeek));
  let index = plan.phases.findIndex((p) => week >= p.weekStart && week <= p.weekEnd);
  if (index === -1) index = currentWeek > PLAN_WEEKS ? plan.phases.length - 1 : 0;
  return { phase: plan.phases[index], phaseIndex: index, week };
}

/** "left" or "right" if the diagnosis clearly names one side. */
export function injuredSide(...texts: (string | null | undefined)[]): Side | null {
  const text = texts.filter(Boolean).join(" ").toLowerCase();
  const left = /\bleft\b/.test(text);
  const right = /\bright\b/.test(text);
  if (left === right) return null;
  return left ? "left" : "right";
}
