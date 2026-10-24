import { z } from "zod";

export const ACTIVITY_LEVELS = {
  sedentary: "Mostly sitting (little regular exercise)",
  light: "Lightly active (walks, light exercise 1–2 days a week)",
  moderate: "Moderately active (exercise 3–4 days a week)",
  very_active: "Very active (hard exercise 5+ days a week)",
  athlete: "Competitive athlete",
} as const;

export const SURGERY_STATUSES = {
  not_discussed: "Not discussed yet / not sure",
  not_recommended: "My doctor said I don't need surgery",
  recommended: "Surgery has been recommended, but I haven't had it",
  done: "I've already had surgery",
} as const;

export const EMERGENCY_SYMPTOMS = {
  numbness: "New or worsening numbness, tingling, or weakness in the injured arm or leg",
  circulation: "Skin on the injured limb that is cold, pale, blue, or gray",
  severe_swelling: "Severe or rapidly increasing swelling, or a cast or splint that feels too tight",
  uncontrolled_pain: "Severe pain that keeps getting worse or isn't eased by your prescribed medicine",
  fever_after_surgery: "Fever of 100.4°F (38°C) or higher, or chills, after surgery",
  wound_problem: "Spreading redness, pus, a bad smell, or an opening incision",
  clot_signs: "Calf pain or swelling, chest pain, or shortness of breath",
  deformity: "A new bend or deformity in the limb, or bone visible through the skin",
} as const;

type Keys<T> = [keyof T & string, ...(keyof T & string)[]];
const keysOf = <T extends object>(obj: T) => Object.keys(obj) as Keys<T>;

export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;
export type SurgeryStatus = keyof typeof SURGERY_STATUSES;
export type EmergencySymptom = keyof typeof EMERGENCY_SYMPTOMS;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker to choose a date.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "That date isn't valid.");

/** Everything the user enters on the intake form (the uploaded file travels separately). */
export const IntakeSchema = z
  .object({
    diagnosisText: z.string().trim().max(2000, "Please keep the diagnosis under 2,000 characters."),
    dateOfInjury: isoDate,
    age: z.number().int().min(1, "Enter your age.").max(120, "Enter a valid age."),
    activityLevel: z.enum(keysOf(ACTIVITY_LEVELS)),
    sport: z.string().trim().max(100),
    surgeryStatus: z.enum(keysOf(SURGERY_STATUSES)),
    surgeryDate: z.union([isoDate, z.literal("")]),
    painLevel: z.number().int().min(0).max(10),
    mainGoal: z
      .string()
      .trim()
      .min(3, "Tell us your main goal.")
      .max(500, "Please keep your goal under 500 characters."),
    symptomsNotes: z.string().trim().max(1000, "Please keep this under 1,000 characters."),
    emergencySymptoms: z.array(z.enum(keysOf(EMERGENCY_SYMPTOMS))).max(8),
    acknowledged: z.literal(true, { error: "Please confirm you understand this is not medical advice." }),
    /** Name of the uploaded file, if any. The file itself is never stored. */
    uploadedFileName: z.string().max(255).nullable(),
  })
  .refine((v) => v.diagnosisText.length > 0 || v.uploadedFileName !== null, {
    message: "Type your diagnosis or upload a photo or PDF of your paperwork.",
    path: ["diagnosisText"],
  });

export type Intake = z.infer<typeof IntakeSchema>;

export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
