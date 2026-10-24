import { AIError, generateRecoveryPlan, type UploadedDocument } from "@/lib/ai";
import { computePlanTiming, daysBetween, toLocalDay } from "@/lib/dates";
import { screenForEmergency } from "@/lib/emergency";
import { ALLOWED_UPLOAD_TYPES, IntakeSchema, MAX_UPLOAD_BYTES } from "@/lib/intake";
import type { PlanApiResponse } from "@/lib/api-types";

// Plan generation can take a minute or two.
export const maxDuration = 300;

function json(body: PlanApiResponse, status = 200) {
  return Response.json(body, { status });
}

function fail(message: string, status: number) {
  return json({ status: "error", message }, status);
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 200_000) {
    return fail("That file is too large. Please upload a file under 10 MB.", 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("We couldn't read the form. Please try again.", 400);
  }

  // --- Intake --------------------------------------------------------------
  let intakeJson: unknown;
  try {
    intakeJson = JSON.parse(String(form.get("intake") ?? ""));
  } catch {
    return fail("We couldn't read your answers. Please try again.", 400);
  }
  const parsed = IntakeSchema.safeParse(intakeJson);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Some answers are missing or invalid.";
    return fail(first, 400);
  }
  const intake = parsed.data;

  // --- Dates ---------------------------------------------------------------
  const serverToday = toLocalDay(new Date());
  const clientToday = String(form.get("today") ?? "");
  // Use the browser's calendar day so time zones don't shift the plan, but
  // only if it's close to the server's date.
  const todayIso =
    /^\d{4}-\d{2}-\d{2}$/.test(clientToday) && Math.abs(daysBetween(serverToday, clientToday)) <= 1
      ? clientToday
      : serverToday;

  if (daysBetween(intake.dateOfInjury, todayIso) < 0) {
    return fail("The date of injury can't be in the future.", 400);
  }
  if (intake.surgeryDate && daysBetween(intake.surgeryDate, todayIso) < 0 && intake.surgeryStatus === "done") {
    return fail("The surgery date can't be in the future if surgery is already done.", 400);
  }

  // --- Emergency screen (runs again even though the browser checks first) --
  const screen = screenForEmergency(intake);
  if (screen.isEmergency) {
    return json({ status: "emergency", reasons: screen.reasons });
  }

  // --- Optional document ---------------------------------------------------
  let document: UploadedDocument | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      return fail("Please upload a JPG, PNG, or WebP photo, or a PDF.", 415);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail("That file is too large. Please upload a file under 10 MB.", 413);
    }
    document = {
      filename: file.name.slice(0, 255) || "paperwork",
      mimeType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    };
  } else if (intake.uploadedFileName) {
    return fail("The uploaded file didn't come through. Please attach it again.", 400);
  }

  // --- Generate ------------------------------------------------------------
  const timing = computePlanTiming(intake, todayIso);
  try {
    const plan = await generateRecoveryPlan({ intake, timing, todayIso, document });

    if (plan.urgentCare.needed) {
      return json({
        status: "emergency",
        reasons: plan.urgentCare.reasons.length
          ? plan.urgentCare.reasons
          : ["Something in your information suggests you may need urgent care."],
      });
    }
    if (plan.cannotCreatePlanReason) {
      return fail(plan.cannotCreatePlanReason, 422);
    }

    return json({
      status: "plan",
      plan,
      planStartDate: timing.planStartDate,
      planStartAnchor: timing.anchor,
    });
  } catch (error) {
    const aiError = error instanceof AIError ? error : new AIError("Something went wrong. Please try again.");
    return fail(aiError.userMessage, aiError.status);
  }
}
