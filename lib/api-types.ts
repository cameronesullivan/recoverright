import type { RecoveryPlan } from "./plan-schema";

/** Response from POST /api/plan */
export type PlanApiResponse =
  | { status: "plan"; plan: RecoveryPlan; planStartDate: string; planStartAnchor: string }
  | { status: "emergency"; reasons: string[] }
  | { status: "error"; message: string };

/** Response from POST /api/chat */
export type ChatApiResponse = { status: "ok"; reply: string } | { status: "error"; message: string };

/** Response from POST /api/coach */
export type CoachApiResponse = { status: "ok"; reply: string } | { status: "error"; message: string };
