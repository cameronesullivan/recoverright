import { z } from "zod";
import { AIError, answerPlanQuestion } from "@/lib/ai";
import type { ChatApiResponse } from "@/lib/api-types";
import { PLAN_WEEKS, daysBetween, toLocalDay, weekNumber } from "@/lib/dates";
import { IntakeSchema } from "@/lib/intake";
import { ChatMessageSchema, RecoveryPlanSchema } from "@/lib/plan-schema";

export const maxDuration = 120;

const MAX_BODY_CHARS = 400_000;
const MAX_MESSAGES = 16;
const MAX_QUESTION_CHARS = 2000;

const ChatRequestSchema = z.object({
  plan: RecoveryPlanSchema,
  intake: IntakeSchema,
  planStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  messages: z.array(ChatMessageSchema).min(1),
});

function json(body: ChatApiResponse, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) {
    return json({ status: "error", message: "That request is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ status: "error", message: "We couldn't read your question. Please try again." }, 400);
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ status: "error", message: "We couldn't read your plan or question. Please try again." }, 400);
  }

  const { plan, intake, planStartDate } = parsed.data;
  // Keep the most recent messages and make sure the conversation starts with the user.
  let messages = parsed.data.messages.slice(-MAX_MESSAGES);
  while (messages.length && messages[0].role !== "user") messages = messages.slice(1);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return json({ status: "error", message: "Please type a question." }, 400);
  }
  if (last.content.length > MAX_QUESTION_CHARS) {
    return json({ status: "error", message: "Please keep your question under 2,000 characters." }, 400);
  }

  const today = toLocalDay(new Date());
  const currentWeek =
    daysBetween(planStartDate, today) < 0 ? 1 : Math.min(PLAN_WEEKS, weekNumber(planStartDate, today));

  try {
    const reply = await answerPlanQuestion({ plan, intake, planStartDate, currentWeek, messages });
    return json({ status: "ok", reply });
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError("Something went wrong. Please try again.");
    return json({ status: "error", message: aiError.userMessage }, aiError.status);
  }
}
