import type { Intake } from "./intake";

export const PLAN_WEEKS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD string as a calendar date (UTC midnight). */
export function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Format a Date as YYYY-MM-DD using the local calendar day. */
export function toLocalDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDay(toIso).getTime() - parseDay(fromIso).getTime()) / DAY_MS);
}

/** 1-based week number of `todayIso` within a plan that starts on `startIso`. */
export function weekNumber(startIso: string, todayIso: string): number {
  return Math.floor(daysBetween(startIso, todayIso) / 7) + 1;
}

export interface PlanTiming {
  /** Day that counts as week 1, day 1. */
  planStartDate: string;
  /** Short explanation of what week 1 is anchored to. */
  anchor: string;
  /** Week the person is in today (1–20). */
  currentWeek: number;
}

/**
 * Week 1 starts on the surgery date (if surgery is done and dated) or the
 * injury date. If that was more than 20 weeks ago, the plan starts today.
 */
export function computePlanTiming(intake: Intake, todayIso: string): PlanTiming {
  const useSurgery = intake.surgeryStatus === "done" && intake.surgeryDate !== "";
  const start = useSurgery ? intake.surgeryDate : intake.dateOfInjury;
  const week = weekNumber(start, todayIso);

  if (week > PLAN_WEEKS) {
    return {
      planStartDate: todayIso,
      anchor: `today (your ${useSurgery ? "surgery" : "injury"} was more than ${PLAN_WEEKS} weeks ago)`,
      currentWeek: 1,
    };
  }
  return {
    planStartDate: start,
    anchor: useSurgery ? "your surgery date" : "your injury date",
    currentWeek: Math.max(1, week),
  };
}

export function formatDay(iso: string): string {
  return parseDay(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
