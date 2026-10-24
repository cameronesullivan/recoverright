import { z } from "zod";
import { AIError, coachReply } from "@/lib/ai";
import type { CoachApiResponse } from "@/lib/api-types";

export const maxDuration = 30;

const MAX_BODY_CHARS = 20_000;
/** The coach only ever sees the most recent messages. */
const MAX_MESSAGES = 6;

const CoachRequestSchema = z.object({
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        sets: z.string().trim().max(60),
        reps: z.string().trim().max(120),
      }),
    )
    .min(1)
    .max(12),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(800),
      }),
    )
    .min(1)
    .max(40),
});

function json(body: CoachApiResponse, status = 200) {
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
    return json({ status: "error", message: "We couldn't read that message." }, 400);
  }

  const parsed = CoachRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ status: "error", message: "We couldn't read that message." }, 400);
  }

  let messages = parsed.data.messages.slice(-MAX_MESSAGES);
  while (messages.length && messages[0].role !== "user") messages = messages.slice(1);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ status: "error", message: "There's no new message for the coach." }, 400);
  }

  try {
    const reply = await coachReply({ exercises: parsed.data.exercises, messages });
    return json({ status: "ok", reply });
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError("The coach is unavailable right now.");
    return json({ status: "error", message: aiError.userMessage }, aiError.status);
  }
}
