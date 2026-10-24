import { z } from "zod";
import { THERAPY_IDS } from "./therapies";

/**
 * The structured recovery plan the AI must return. This schema is sent to the
 * model as a strict JSON Schema and used again to validate the response, so
 * the plan page can always render it.
 *
 * Strict structured outputs require every field to be present, so "optional"
 * values are modeled as nullable instead.
 */

const text = (description: string) => z.string().describe(description);
const list = (description: string) => z.array(z.string()).describe(description);

export const ExerciseSchema = z.object({
  name: text("Common, plain-language exercise name."),
  purpose: text("One sentence on what this exercise helps with."),
  sets: text("Number of sets, e.g. '3'."),
  reps: text("Reps or hold time, e.g. '10 reps' or 'hold 20–30 seconds'."),
  frequency: text("How often, e.g. '2 times a day' or '3 days a week'."),
  steps: list("Step-by-step instructions, 3–6 short steps."),
  safetyNote: text("What it should feel like and when to ease off."),
});

export const PhaseSchema = z.object({
  name: text("Short phase name, e.g. 'Protect and calm down'."),
  weekStart: z.number().int().min(1).max(20).describe("First week of the phase (1–20)."),
  weekEnd: z.number().int().min(1).max(20).describe("Last week of the phase (1–20)."),
  focus: text("One or two sentences on the main focus of this phase."),
  whatToExpect: text("What the person will likely feel and be able to do in this phase."),
  goals: list("3–5 goals for this phase."),
  milestones: list("2–4 concrete milestones that suggest readiness for the next phase."),
  precautions: list("Things to avoid or be careful with during this phase."),
  exercises: z.array(ExerciseSchema).describe("3–6 home exercises appropriate for this phase."),
});

const PathSchema = z.object({
  description: text("What this path involves."),
  pros: list("Advantages."),
  cons: list("Disadvantages and risks."),
  typicalRecovery: text("Typical recovery timeline and return-to-activity for this path."),
});

const TipSchema = z.object({
  tip: text("The tip itself, in plain language."),
  why: text("Why it helps healing, in one sentence."),
});

export const RecoveryPlanSchema = z.object({
  cannotCreatePlanReason: z
    .string()
    .nullable()
    .describe(
      "Null in normal cases. Only set this if the input is not an injury, is unreadable, or is too unclear to plan for; explain kindly what the user should provide instead.",
    ),
  urgentCare: z
    .object({
      needed: z
        .boolean()
        .describe(
          "True ONLY if the user's current symptoms (not standard discharge warnings) suggest they need urgent medical care now.",
        ),
      reasons: list("Plain-language reasons, empty if not needed."),
    })
    .describe("Emergency check."),
  title: text("Short plan title, e.g. 'Recovery plan: left wrist fracture'."),
  injuryName: text("Plain-language name of the injury."),
  summary: text("2–3 sentence friendly summary of the plan."),
  paperworkFindings: z
    .string()
    .nullable()
    .describe("If a document or photo was provided, a short summary of what it says. Otherwise null."),
  assumptions: list("Anything assumed because the input was unclear. Can be empty."),
  overview: z.object({
    whatItIs: text("What the injury is, in plain language (no jargon without explanation)."),
    howItHeals: z
      .array(z.object({ stage: text("Healing stage name."), timing: text("Rough timing."), description: text("What's happening in the body.") }))
      .describe("The biological stages of healing for this injury, in order."),
    typicalRecoveryTime: text("Typical overall recovery and return-to-activity timeline."),
    factorsThatAffectHealing: list("Factors that speed up or slow down healing for this person."),
  }),
  phases: z
    .array(PhaseSchema)
    .describe("3–5 phases that together cover weeks 1 through 20 with no gaps or overlaps."),
  homeExerciseGuidance: list("General rules for doing home exercises safely (pain rules, warm-up, progression)."),
  stopExerciseWarningSigns: list("Warning signs that mean stop exercising and contact the care team."),
  surgery: z.object({
    yourSituation: text("How the surgical question applies to this person, given their surgery status."),
    whenSurgeryIsRecommended: list("Situations in which surgery is typically recommended for this injury."),
    surgical: PathSchema,
    nonSurgical: PathSchema,
    questionsForSurgeon: list("6–10 questions to ask a surgeon."),
  }),
  alternativeTherapies: z
    .array(
      z.object({
        therapyId: z.enum(THERAPY_IDS).describe("Id from the curated list."),
        whyRelevant: text(
          "1–2 sentences on why this may come up for this injury and what to discuss with the doctor. No dosing, no new claims, no citations.",
        ),
      }),
    )
    .describe("4–8 relevant items chosen from the curated therapy list."),
  lifestyle: z.object({
    nutrition: z.array(TipSchema),
    sleep: z.array(TipSchema),
    habits: z.array(TipSchema).describe("Other lifestyle factors: smoking, alcohol, stress, staying active safely."),
  }),
  redFlags: z.object({
    goToERNow: list("Symptoms that mean call 911 or go to the ER now."),
    callDoctorSoon: list("Symptoms that mean call the doctor's office within a day."),
  }),
  questionsForDoctor: list("8–12 questions for the doctor."),
  questionsForPT: list("6–10 questions for the physical therapist."),
});

export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20_000),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
