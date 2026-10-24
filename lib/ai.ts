import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { PlanTiming } from "./dates";
import { PLAN_WEEKS, formatDay } from "./dates";
import {
  ACTIVITY_LEVELS,
  EMERGENCY_SYMPTOMS,
  SURGERY_STATUSES,
  type Intake,
} from "./intake";
import { RecoveryPlanSchema, type ChatMessage, type RecoveryPlan } from "./plan-schema";
import { EVIDENCE_LABELS, THERAPIES, getTherapy } from "./therapies";

/**
 * Every AI call in the app goes through this file. To switch providers,
 * reimplement `generateRecoveryPlan`, `answerPlanQuestion`, and `coachReply`
 * with the same signatures; nothing else needs to change.
 */

const DEFAULT_MODEL = "gpt-6.1-sol";
/** Small, fast model for short guided-session coaching messages. */
const DEFAULT_COACH_MODEL = "gpt-5-mini";

export class AIError extends Error {
  constructor(
    /** Safe, friendly message to show the user. */
    public readonly userMessage: string,
    public readonly status = 500,
  ) {
    super(userMessage);
    this.name = "AIError";
  }
}

export interface UploadedDocument {
  filename: string;
  mimeType: string;
  base64: string;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIError(
      "The AI service isn't set up yet. Add your OPENAI_API_KEY to .env.local and restart the server.",
      500,
    );
  }
  client ??= new OpenAI({ apiKey, timeout: 240_000, maxRetries: 1 });
  return client;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function getCoachModel(): string {
  return process.env.OPENAI_COACH_MODEL?.trim() || DEFAULT_COACH_MODEL;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SAFETY_RULES = `
Safety and honesty rules (always follow):
- This is educational information to discuss with a doctor or physical therapist. It is not medical advice, a diagnosis, or a prescription.
- Never invent citations, study names, authors, journals, statistics from specific studies, or URLs. Describe evidence in general terms only.
- Never give doses, schedules, or sourcing for substances that are not FDA-approved (for example BPC-157, TB-500, growth hormone peptides). Do not give medication doses of any kind; say to ask the prescriber.
- Do not tell anyone to stop, start, or change a prescribed medicine, brace, or weight-bearing restriction. Defer to their care team.
- If something the person describes could be an emergency, say so clearly and tell them to seek care now.
- Use plain language at about an 8th-grade reading level. Explain any medical term the first time you use it.
`.trim();

function therapyCatalog(): string {
  return THERAPIES.map(
    (t) =>
      `- id: ${t.id} | ${t.name} | ${EVIDENCE_LABELS[t.evidenceLevel]} | relevant for: ${t.relevantFor.join(", ")}\n  ${t.evidenceSummary}`,
  ).join("\n");
}

const PLAN_INSTRUCTIONS = `
You are RecoverRight, a careful assistant that helps injured people understand their injury and prepare a ${PLAN_WEEKS}-week home recovery plan to review with their doctor and physical therapist.

${SAFETY_RULES}

How to build the plan:
- Base the plan on the diagnosis the person typed and/or the paperwork they uploaded. If both are given and they conflict, follow the paperwork and note the conflict in "assumptions".
- If a document or photo is provided, read it carefully and summarize what it says in "paperworkFindings" (diagnosis, side, treatment, restrictions, follow-up). Do not repeat personal identifiers such as names, birth dates, addresses, or record numbers.
- Week 1 is the plan start date given below. Create 3–5 phases that cover weeks 1–${PLAN_WEEKS} exactly, in order, with no gaps or overlaps. Make the timeline realistic for the injury, the person's surgery status, age, and activity level. If they are already partway through recovery, the early phases should still describe what normally happens, and the current week should be accurate.
- Exercises must be standard, commonly prescribed, low-risk home exercises suited to each phase and the person's restrictions. If the injured part is typically immobilized (cast, sling, brace, non-weight-bearing) in a phase, give exercises for nearby free joints, gentle approved movements, and general fitness that respects the restriction, and say clearly that the care team must clear any movement of the injured area.
- Be honest that timelines vary and that the care team's instructions come first.
- Surgery section: explain when surgery is typically recommended for this injury, give balanced pros and cons for each path, and tailor "yourSituation" to their surgery status.
- Alternative therapies: choose 4–8 items ONLY from the curated list below, by id, that are genuinely relevant to this injury and situation. Include at least one experimental item when the injury type is commonly targeted by such marketing (for example tendon and ligament injuries and peptides), so the person gets an honest view. In "whyRelevant", explain why it may come up for them and what to ask their doctor. Do not restate or contradict the curated evidence summary, and do not add new claims.
- Nutrition, sleep, and habits: practical, evidence-based basics (protein, calcium and vitamin D for bone, overall energy intake, avoiding smoking and nicotine, limiting alcohol, sleep). General food-based targets are fine; for supplements, say to ask the doctor.
- Red flags: specific to this injury and to surgery if relevant.
- Questions: specific and useful, not generic.
- Set urgentCare.needed to true only if the person's own description of how they feel now suggests an emergency (for example numbness, loss of circulation, severe or rapidly worsening swelling, fever after surgery, signs of a blood clot). Standard warnings printed on discharge paperwork are not current symptoms.
- Set cannotCreatePlanReason only if the input is clearly not a physical injury, is unreadable, or is too vague to plan for. Otherwise make reasonable assumptions, list them, and create the plan.

Curated alternative therapy list (the only options you may choose from):
${therapyCatalog()}
`.trim();

function describeIntake(intake: Intake, timing: PlanTiming, todayIso: string): string {
  const symptoms = intake.emergencySymptoms.map((k) => EMERGENCY_SYMPTOMS[k]);
  return [
    `Today's date: ${formatDay(todayIso)}`,
    `Diagnosis (typed by the person): ${intake.diagnosisText || "(not typed; see the uploaded paperwork)"}`,
    intake.uploadedFileName ? `Uploaded paperwork: ${intake.uploadedFileName} (attached)` : "Uploaded paperwork: none",
    `Date of injury: ${formatDay(intake.dateOfInjury)}`,
    `Surgery status: ${SURGERY_STATUSES[intake.surgeryStatus]}`,
    intake.surgeryDate ? `Surgery date: ${formatDay(intake.surgeryDate)}` : null,
    `Plan start (week 1, day 1): ${formatDay(timing.planStartDate)}, based on ${timing.anchor}`,
    `The person is currently in week ${timing.currentWeek} of ${PLAN_WEEKS}.`,
    `Age: ${intake.age}`,
    `Activity level: ${ACTIVITY_LEVELS[intake.activityLevel]}`,
    `Sport: ${intake.sport || "none given"}`,
    `Current pain level: ${intake.painLevel}/10`,
    `Main goal: ${intake.mainGoal}`,
    `Other notes or current symptoms: ${intake.symptomsNotes || "none given"}`,
    `Emergency symptoms checked: ${symptoms.length ? symptoms.join("; ") : "none"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateRecoveryPlan(input: {
  intake: Intake;
  timing: PlanTiming;
  todayIso: string;
  document: UploadedDocument | null;
}): Promise<RecoveryPlan> {
  const openai = getClient();
  const { intake, timing, todayIso, document } = input;

  const content: OpenAI.Responses.ResponseInputContent[] = [
    { type: "input_text", text: describeIntake(intake, timing, todayIso) },
  ];
  if (document) {
    const dataUrl = `data:${document.mimeType};base64,${document.base64}`;
    content.push(
      document.mimeType === "application/pdf"
        ? { type: "input_file", filename: document.filename, file_data: dataUrl }
        : { type: "input_image", image_url: dataUrl, detail: "high" },
    );
  }

  try {
    const response = await openai.responses.parse({
      model: getModel(),
      instructions: PLAN_INSTRUCTIONS,
      input: [{ role: "user", content }],
      text: { format: zodTextFormat(RecoveryPlanSchema, "recovery_plan") },
      reasoning: { effort: "low" },
      max_output_tokens: 32_000,
      store: false,
    });

    if (response.status === "incomplete") {
      throw new AIError("The plan came back incomplete. Please try again.", 502);
    }
    const plan = response.output_parsed;
    if (!plan) {
      throw new AIError(
        "The AI couldn't create a plan from this information. Try describing your diagnosis in a little more detail.",
        422,
      );
    }
    return normalizePlan(plan);
  } catch (error) {
    throw toAIError(error);
  }
}

export async function answerPlanQuestion(input: {
  plan: RecoveryPlan;
  intake: Intake;
  planStartDate: string;
  currentWeek: number;
  messages: ChatMessage[];
}): Promise<string> {
  const openai = getClient();
  const { plan, intake, planStartDate, currentWeek, messages } = input;

  const therapies = plan.alternativeTherapies
    .map((item) => getTherapy(item.therapyId))
    .filter((t) => t !== undefined)
    .map((t) => ({
      name: t.name,
      evidence: EVIDENCE_LABELS[t.evidenceLevel],
      summary: t.evidenceSummary,
      risks: t.risks,
      regulatoryStatus: t.regulatoryStatus,
    }));

  const instructions = `
You are RecoverRight's assistant. The person is asking follow-up questions about their personal recovery plan, shown below. Answer using the plan and general medical knowledge.

${SAFETY_RULES}

Answer style:
- Be warm, clear, and brief: usually 2–6 short paragraphs or a short list. Plain text only; use "- " for list items, no markdown headings or tables.
- Tie answers to their plan and current week when helpful.
- If the question is outside what you can safely answer, or depends on their exam or imaging, say so and suggest what to ask their doctor or PT.
- For therapies, only use the curated evidence information provided below. Do not add claims or citations.
- Stay on the topic of their injury, recovery, and health. Politely decline unrelated requests.
- If they describe symptoms that could be an emergency, tell them to call 911 or go to the ER now, before anything else.

Their details:
- Plan start (week 1): ${formatDay(planStartDate)}; they are in about week ${currentWeek} of ${PLAN_WEEKS}
- Age ${intake.age}; activity level: ${ACTIVITY_LEVELS[intake.activityLevel]}; sport: ${intake.sport || "none"}
- Surgery status: ${SURGERY_STATUSES[intake.surgeryStatus]}
- Main goal: ${intake.mainGoal}

Curated therapy information for their plan:
${JSON.stringify(therapies)}

Their plan (JSON):
${JSON.stringify(plan)}
`.trim();

  try {
    const response = await openai.responses.create({
      model: getModel(),
      instructions,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      reasoning: { effort: "low" },
      max_output_tokens: 4_000,
      store: false,
    });
    const reply = response.output_text.trim();
    if (!reply) {
      throw new AIError("The assistant didn't return an answer. Please try asking again.", 502);
    }
    return reply;
  } catch (error) {
    throw toAIError(error);
  }
}

export interface CoachExercise {
  name: string;
  sets: string;
  reps: string;
}

/**
 * Short text coaching for guided exercise sessions. Receives only today's
 * exercise list and the last few text messages (session events such as
 * "set 2 complete, best knee bend 92°" and the person's questions). Never
 * images or video.
 */
export async function coachReply(input: { exercises: CoachExercise[]; messages: ChatMessage[] }): Promise<string> {
  const openai = getClient();
  const model = getCoachModel();
  const exerciseList = input.exercises.map((e) => `- ${e.name}: ${e.sets} sets, ${e.reps}`).join("\n");

  const instructions = `
You are the RecoverRight guided-session coach, a calm, encouraging text coach for someone doing home rehab exercises.

What you receive:
- Messages that start with "Event:" come from rep-counting software that estimates joint angles from a camera. You cannot see the person or any video. Angles are estimates.
- Other user messages are questions typed by the person between sets.

How to reply:
- 1 or 2 short sentences, under 40 words. Plain text only, no lists, markdown, or emoji.
- Warm, calm, and specific to the event. For a form issue, give one simple cue. For a finished set or exercise, give brief encouragement and, if useful, one tip.
- Never diagnose, never guess what is wrong with their body, never give medication or supplement doses, and never change their doctor's or physical therapist's instructions.
- If pain is 7/10 or higher, or they tapped "That hurts": tell them to stop this exercise, rest or try a gentler version, and contact their physical therapist if the pain continues.
- If they describe chest pain, trouble breathing, new numbness, a cold, pale, or blue limb, sudden severe swelling, calf pain with swelling, or fever after surgery: tell them to stop and get medical care now (call 911 if severe).
- Don't push them past comfort. Sharp pain means stop.
- If a question isn't about today's exercises or their recovery, kindly steer back to the session.
- You are AI guidance, not a licensed physical therapist. Say so if they ask for clinical judgment, and suggest asking their PT.

Today's exercises:
${exerciseList}
`.trim();

  try {
    const response = await openai.responses.create(
      {
        model,
        instructions,
        input: input.messages.map((m) => ({ role: m.role, content: m.content })),
        // GPT-5-era models allow "minimal"; newer ones start at "low".
        reasoning: { effort: /^gpt-5(-|$)/.test(model) ? "minimal" : "low" },
        text: { verbosity: "low" },
        max_output_tokens: 600,
        store: false,
      },
      { timeout: 20_000, maxRetries: 0 },
    );
    const reply = shortenReply(response.output_text);
    if (!reply) throw new AIError("The coach didn't return a message.", 502);
    return reply;
  } catch (error) {
    throw toAIError(error, "OPENAI_COACH_MODEL");
  }
}

/** Keep coach replies to at most two sentences and 300 characters. */
function shortenReply(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g);
  let short = sentences ? sentences.slice(0, 2).join("").trim() : clean;
  if (!short) short = clean;
  return short.length > 300 ? `${short.slice(0, 297).trimEnd()}…` : short;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make sure phases cover weeks 1–20 in order and therapies are unique. */
function normalizePlan(plan: RecoveryPlan): RecoveryPlan {
  const phases = [...plan.phases].sort((a, b) => a.weekStart - b.weekStart);
  let nextStart = 1;
  const fixed = phases.map((phase, i) => {
    const weekStart = nextStart;
    const isLast = i === phases.length - 1;
    const weekEnd = isLast ? PLAN_WEEKS : Math.min(PLAN_WEEKS, Math.max(weekStart, phase.weekEnd));
    nextStart = weekEnd + 1;
    return { ...phase, weekStart, weekEnd };
  });
  const phasesInRange = fixed.filter((p) => p.weekStart <= PLAN_WEEKS);
  if (phasesInRange.length > 0) {
    phasesInRange[phasesInRange.length - 1].weekEnd = PLAN_WEEKS;
  }

  const seen = new Set<string>();
  const alternativeTherapies = plan.alternativeTherapies.filter((item) => {
    if (seen.has(item.therapyId)) return false;
    seen.add(item.therapyId);
    return true;
  });

  return { ...plan, phases: phasesInRange, alternativeTherapies };
}

function toAIError(error: unknown, modelEnvVar = "OPENAI_MODEL"): AIError {
  if (error instanceof AIError) return error;

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIError("The AI took too long to respond. Please try again.", 504);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AIError("We couldn't reach the AI service. Check your internet connection and try again.", 502);
  }
  if (error instanceof OpenAI.APIError) {
    console.error(`[ai] OpenAI API error ${error.status}: ${error.message}`);
    switch (error.status) {
      case 401:
      case 403:
        return new AIError("The OpenAI API key was rejected. Check OPENAI_API_KEY in .env.local.", 500);
      case 404:
        return new AIError(
          `The AI model isn't available on this OpenAI account. Check ${modelEnvVar} in .env.local.`,
          500,
        );
      case 429:
        return new AIError(
          "The AI service is busy or the OpenAI account is out of credits. Please wait a minute and try again.",
          429,
        );
      case 400:
        return new AIError(
          "The AI couldn't process this request. If you uploaded a file, try a clearer photo or a different file.",
          400,
        );
      default:
        return new AIError("The AI service had a problem. Please try again in a moment.", 502);
    }
  }

  console.error("[ai] Unexpected error:", error instanceof Error ? error.message : error);
  return new AIError("Something went wrong while creating your plan. Please try again.", 500);
}
