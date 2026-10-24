"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import type { PlanApiResponse } from "@/lib/api-types";
import { daysBetween, toLocalDay } from "@/lib/dates";
import { screenForEmergency } from "@/lib/emergency";
import {
  ACTIVITY_LEVELS,
  ALLOWED_UPLOAD_TYPES,
  EMERGENCY_SYMPTOMS,
  IntakeSchema,
  MAX_UPLOAD_BYTES,
  SURGERY_STATUSES,
  type ActivityLevel,
  type EmergencySymptom,
  type Intake,
  type SurgeryStatus,
} from "@/lib/intake";
import { planStore, StorageError } from "@/lib/storage";
import { Disclaimer } from "./Disclaimer";
import { EmergencyNotice } from "./EmergencyNotice";
import { GeneratingPlan } from "./GeneratingPlan";

interface FormValues {
  diagnosisText: string;
  dateOfInjury: string;
  age: string;
  activityLevel: ActivityLevel | "";
  sport: string;
  surgeryStatus: SurgeryStatus | "";
  surgeryDate: string;
  painLevel: number | null;
  mainGoal: string;
  symptomsNotes: string;
  emergencySymptoms: EmergencySymptom[];
  acknowledged: boolean;
}

const INITIAL: FormValues = {
  diagnosisText: "",
  dateOfInjury: "",
  age: "",
  activityLevel: "",
  sport: "",
  surgeryStatus: "",
  surgeryDate: "",
  painLevel: null,
  mainGoal: "",
  symptomsNotes: "",
  emergencySymptoms: [],
  acknowledged: false,
};

type Errors = Partial<Record<keyof FormValues | "file", string>>;
type Stage =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "emergency"; reasons: string[] }
  | { kind: "error"; message: string };

/**
 * Upper limit on how long the loading screen can show. A plan normally takes
 * 1–2 minutes; this matches the plan API route's maxDuration (300 seconds).
 */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const TIMEOUT_MESSAGE =
  "Creating your plan took longer than 5 minutes, so we stopped waiting. The AI service may be busy. Please try again.";
const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

/** Parse the plan API response, turning anything unexpected into a readable error. */
async function readPlanResponse(response: Response): Promise<PlanApiResponse> {
  try {
    const data = (await response.json()) as Partial<PlanApiResponse> | null;
    if (data && (data.status === "plan" || data.status === "emergency" || data.status === "error")) {
      return data as PlanApiResponse;
    }
  } catch {
    // Fall through to the generic error below.
  }
  return {
    status: "error",
    message: `The server sent an unexpected response (error ${response.status}). Please try again.`,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * With `cacheComponents` enabled, Next.js keeps recently visited pages mounted
 * (hidden inside React <Activity>) and restores their state when you return.
 * That's why the intake page used to reappear stuck on the loading screen.
 *
 * Two things make every new visit start fresh:
 * - `bfcacheId` changes on each push/replace navigation (for example clicking
 *   "Build my recovery plan"), so keying on it mounts a brand-new form.
 * - After a plan is created, the form resets itself when the page is hidden,
 *   which also covers returning with the browser's Back button.
 */
export function IntakeForm() {
  const { bfcacheId } = useRouter();
  return <IntakeFormInner key={bfcacheId} />;
}

function IntakeFormInner() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(INITIAL);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [dragging, setDragging] = useState(false);
  /** True after "I don't have my medical documents": shows the description box instead of the upload area. */
  const [describing, setDescribing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  /** False while this page is hidden (navigated away) or unmounted. */
  const visibleRef = useRef(false);
  /** Set after a plan is created so the form resets as soon as the page is hidden. */
  const resetOnHideRef = useRef(false);
  /** The last submitted answers, so "Try again" can resend them. */
  const lastSubmissionRef = useRef<{ intake: Intake; file: File | null } | null>(null);

  const resetForm = useCallback(() => {
    setValues(INITIAL);
    setFile(null);
    setErrors({});
    setDragging(false);
    setDescribing(false);
    setStage({ kind: "form" });
    lastSubmissionRef.current = null;
  }, []);

  // Runs when the page becomes visible; the cleanup runs when Next.js hides it
  // (navigating away) or unmounts it. useLayoutEffect avoids a flash of stale UI.
  useLayoutEffect(() => {
    visibleRef.current = true;
    return () => {
      visibleRef.current = false;
      if (resetOnHideRef.current) {
        resetOnHideRef.current = false;
        resetForm();
      }
    };
  }, [resetForm]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function chooseFile(next: File | null) {
    setErrors((e) => ({ ...e, file: undefined, diagnosisText: undefined }));
    if (!next) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(next.type)) {
      setErrors((e) => ({
        ...e,
        file: "Please choose a JPG, PNG, or WebP photo, or a PDF. (iPhone HEIC photos: take a screenshot of the photo and upload that.)",
      }));
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setErrors((e) => ({ ...e, file: "That file is over 10 MB. Try a smaller photo or a screenshot." }));
      return;
    }
    setFile(next);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  function showDescription(show: boolean) {
    setDescribing(show);
    setErrors((e) => ({ ...e, diagnosisText: undefined, file: undefined }));
    requestAnimationFrame(() => document.getElementById(show ? "diagnosisText" : "file")?.focus());
  }

  function toggleSymptom(key: EmergencySymptom) {
    set(
      "emergencySymptoms",
      values.emergencySymptoms.includes(key)
        ? values.emergencySymptoms.filter((k) => k !== key)
        : [...values.emergencySymptoms, key],
    );
  }

  function validate(): Intake | null {
    const next: Errors = {};
    if (!values.dateOfInjury) next.dateOfInjury = "Choose the date of your injury.";
    if (!values.age) next.age = "Enter your age.";
    if (!values.activityLevel) next.activityLevel = "Choose your activity level.";
    if (!values.surgeryStatus) next.surgeryStatus = "Choose an option.";
    if (values.painLevel === null) next.painLevel = "Choose your current pain level.";

    const today = toLocalDay(new Date());
    if (values.dateOfInjury && daysBetween(values.dateOfInjury, today) < 0) {
      next.dateOfInjury = "The date of injury can't be in the future.";
    }
    if (
      values.surgeryStatus === "done" &&
      values.surgeryDate &&
      daysBetween(values.surgeryDate, today) < 0
    ) {
      next.surgeryDate = "If surgery is already done, the date can't be in the future.";
    }

    const candidate = {
      // Only send the description while its box is showing, so what's sent matches what's on screen.
      diagnosisText: describing ? values.diagnosisText : "",
      dateOfInjury: values.dateOfInjury,
      age: Number(values.age),
      activityLevel: values.activityLevel,
      sport: values.sport,
      surgeryStatus: values.surgeryStatus,
      surgeryDate: values.surgeryStatus === "done" ? values.surgeryDate : "",
      painLevel: values.painLevel ?? -1,
      mainGoal: values.mainGoal,
      symptomsNotes: values.symptomsNotes,
      emergencySymptoms: values.emergencySymptoms,
      acknowledged: values.acknowledged,
      uploadedFileName: file?.name ?? null,
    };
    const result = IntakeSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        if (key && !next[key]) next[key] = issue.message;
      }
    }
    // Friendlier wording for the few fields where zod's default message isn't helpful.
    if (next.age && values.age) next.age = "Enter an age between 1 and 120.";
    // Need a document or a description. Checked here so the message shows even when
    // other fields also have errors.
    if (!file && !candidate.diagnosisText.trim()) {
      next.diagnosisText = describing
        ? "Describe your injury, or go back and upload a medical document."
        : "Upload a medical document, or choose \u201cI don\u2019t have my medical documents\u201d to describe your injury.";
    }
    if (!values.acknowledged) next.acknowledged = "Please check this box to continue.";

    setErrors(next);
    const hasErrors = Object.values(next).some(Boolean);
    return hasErrors || !result.success ? null : result.data;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const intake = validate();
    if (!intake) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      });
      return;
    }

    const screen = screenForEmergency(intake);
    if (screen.isEmergency) {
      setStage({ kind: "emergency", reasons: screen.reasons });
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    void generate(intake, file);
  }

  async function generate(intake: Intake, upload: File | null) {
    lastSubmissionRef.current = { intake, file: upload };
    setStage({ kind: "loading" });
    topRef.current?.scrollIntoView({ behavior: "smooth" });

    const body = new FormData();
    body.set("intake", JSON.stringify(intake));
    body.set("today", toLocalDay(new Date()));
    if (upload) body.set("file", upload);

    // Never wait forever: abort the request if it runs past the time limit.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    let result: PlanApiResponse;
    try {
      const response = await fetch("/api/plan", { method: "POST", body, signal: controller.signal });
      result = await readPlanResponse(response);
    } catch {
      result = { status: "error", message: controller.signal.aborted ? TIMEOUT_MESSAGE : NETWORK_MESSAGE };
    } finally {
      window.clearTimeout(timer);
    }

    if (result.status === "emergency") {
      setStage({ kind: "emergency", reasons: result.reasons });
      return;
    }
    if (result.status === "error") {
      setStage({ kind: "error", message: result.message });
      return;
    }

    const id = newId();
    try {
      await planStore.save({
        version: 1,
        id,
        createdAt: new Date().toISOString(),
        planStartDate: result.planStartDate,
        planStartAnchor: result.planStartAnchor,
        intake,
        plan: result.plan,
        chat: [],
        sessions: [],
      });
    } catch (error) {
      setStage({
        kind: "error",
        message:
          error instanceof StorageError ? error.message : "Your plan was created but couldn't be saved in this browser.",
      });
      return;
    }

    if (visibleRef.current) {
      // Reset once the plan page replaces this one, so coming back shows a fresh form.
      resetOnHideRef.current = true;
      router.push(`/plans/${id}`);
    } else {
      // The user left while the plan was generating. It's saved under "My plans";
      // don't pull them away from wherever they are now.
      resetForm();
    }
  }

  function retry() {
    const last = lastSubmissionRef.current;
    if (last) void generate(last.intake, last.file);
    else setStage({ kind: "form" });
  }

  if (stage.kind === "loading") {
    return (
      <div ref={topRef}>
        <GeneratingPlan hasFile={file !== null} />
      </div>
    );
  }

  if (stage.kind === "emergency") {
    return (
      <div ref={topRef}>
        <EmergencyNotice reasons={stage.reasons} onBack={() => setStage({ kind: "form" })} />
      </div>
    );
  }

  if (stage.kind === "error") {
    return (
      <div ref={topRef}>
        <div role="alert" className="card border-amber-300 bg-amber-50 text-amber-950">
          <h2 className="text-xl font-semibold">We couldn&apos;t create your plan</h2>
          <p className="mt-2">{stage.message}</p>
          <p className="mt-2 text-sm">Your answers are saved on this page, so you don&apos;t need to fill them in again.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={retry} className="btn-primary">
              Try again
            </button>
            <button type="button" onClick={() => setStage({ kind: "form" })} className="btn-secondary">
              Edit my answers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef}>
      <Disclaimer className="mb-6" />

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {/* Diagnosis ---------------------------------------------------- */}
        {describing ? (
          <Section title="Your diagnosis" description="Tell us about your injury in your own words.">
            <div>
              <label htmlFor="diagnosisText" className="field-label">
                Describe your injury
              </label>
              <textarea
                id="diagnosisText"
                rows={4}
                className="field-input"
                placeholder="What happened, where it hurts, and any diagnosis you were told. For example: fell on my outstretched hand, left wrist is swollen, the ER said it's a distal radius fracture."
                value={values.diagnosisText}
                onChange={(e) => set("diagnosisText", e.target.value)}
                aria-invalid={Boolean(errors.diagnosisText)}
                aria-describedby={errors.diagnosisText ? "diagnosisText-error" : undefined}
                maxLength={2000}
              />
              <FieldError id="diagnosisText-error" message={errors.diagnosisText} />
            </div>
            <button
              type="button"
              onClick={() => showDescription(false)}
              className="text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
            >
              ← I have a medical document to upload
            </button>
          </Section>
        ) : (
          <Section title="Your diagnosis">
            <div>
              <span className="field-label text-base">Upload your medical document</span>
              <p className="field-hint">
                A photo or PDF of your diagnosis, discharge paperwork, or imaging report gives you the most accurate
                plan. The AI reads it, and the file is not stored.
              </p>
              {file ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-teal-950">{file.name}</p>
                    <p className="text-sm text-teal-800">{formatBytes(file.size)}</p>
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => chooseFile(null)}>
                    Remove
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="file"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20 ${
                    dragging ? "border-teal-500 bg-teal-50" : "border-teal-300 bg-teal-50/50 hover:border-teal-500 hover:bg-teal-50"
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-10 w-10 fill-teal-600" aria-hidden="true">
                    <path d="M11 16V7.8l-3.6 3.6L6 10l6-6 6 6-1.4 1.4L13 7.8V16h-2Zm-6 4v-5h2v3h10v-3h2v5H5Z" />
                  </svg>
                  <span className="mt-3 inline-flex rounded-full bg-teal-700 px-5 py-2.5 font-semibold text-white shadow-sm">
                    Upload a photo or PDF
                  </span>
                  <span className="mt-2 text-sm text-slate-600">or drag it here · JPG, PNG, WebP, or PDF, up to 10 MB</span>
                  <input
                    ref={fileInput}
                    id="file"
                    type="file"
                    accept={ALLOWED_UPLOAD_TYPES.join(",")}
                    className="sr-only"
                    onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                    aria-invalid={Boolean(errors.file || errors.diagnosisText)}
                  />
                </label>
              )}
              <FieldError message={errors.file ?? errors.diagnosisText} />
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-sky-50 px-4 py-3 text-base text-slate-700 ring-1 ring-sky-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 flex-none fill-teal-700" aria-hidden="true">
                  <path d="M11 4h2v8.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4 3.6 3.6V4Zm-6 15h14v2H5v-2Z" />
                </svg>
                <span>Just trying it out?</span>
                <a
                  href="/sample/Sample-Elbow-Dislocation-Injury.jpg"
                  download="Sample-Elbow-Dislocation-Injury.jpg"
                  className="font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-950"
                >
                  Download a sample injury report
                </a>
              </p>
            </div>
            {!file && (
              <button
                type="button"
                onClick={() => showDescription(true)}
                className="text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800"
              >
                I don&apos;t have my medical documents
              </button>
            )}
          </Section>
        )}

        {/* Timing and surgery ------------------------------------------ */}
        <Section title="Your injury and treatment">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="dateOfInjury" className="field-label">
                Date of injury
              </label>
              <input
                id="dateOfInjury"
                type="date"
                className="field-input"
                value={values.dateOfInjury}
                onChange={(e) => set("dateOfInjury", e.target.value)}
                aria-invalid={Boolean(errors.dateOfInjury)}
              />
              <FieldError message={errors.dateOfInjury} />
            </div>
            <div>
              <label htmlFor="age" className="field-label">
                Your age
              </label>
              <input
                id="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                className="field-input"
                value={values.age}
                onChange={(e) => set("age", e.target.value)}
                aria-invalid={Boolean(errors.age)}
              />
              <FieldError message={errors.age} />
            </div>
          </div>

          <fieldset>
            <legend className="field-label">Has surgery been recommended or done?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(Object.entries(SURGERY_STATUSES) as [SurgeryStatus, string][]).map(([key, label]) => (
                <ChoiceCard
                  key={key}
                  name="surgeryStatus"
                  checked={values.surgeryStatus === key}
                  onChange={() => set("surgeryStatus", key)}
                  invalid={Boolean(errors.surgeryStatus)}
                >
                  {label}
                </ChoiceCard>
              ))}
            </div>
            <FieldError message={errors.surgeryStatus} />
          </fieldset>

          {values.surgeryStatus === "done" && (
            <div className="sm:w-1/2 sm:pr-2.5">
              <label htmlFor="surgeryDate" className="field-label">
                Date of surgery (optional)
              </label>
              <input
                id="surgeryDate"
                type="date"
                className="field-input"
                value={values.surgeryDate}
                onChange={(e) => set("surgeryDate", e.target.value)}
                aria-invalid={Boolean(errors.surgeryDate)}
              />
              <p className="field-hint">If you add it, your plan&apos;s week 1 starts on your surgery date.</p>
              <FieldError message={errors.surgeryDate} />
            </div>
          )}

          <fieldset>
            <legend className="field-label">Current pain level</legend>
            <p className="field-hint">0 means no pain. 10 means the worst pain you can imagine.</p>
            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-11">
              {Array.from({ length: 11 }, (_, n) => (
                <label
                  key={n}
                  className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-base font-semibold transition has-focus-visible:ring-2 has-focus-visible:ring-teal-600 ${
                    values.painLevel === n
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="painLevel"
                    value={n}
                    className="sr-only"
                    checked={values.painLevel === n}
                    onChange={() => set("painLevel", n)}
                    aria-invalid={Boolean(errors.painLevel)}
                  />
                  {n}
                </label>
              ))}
            </div>
            <FieldError message={errors.painLevel} />
          </fieldset>
        </Section>

        {/* About you ---------------------------------------------------- */}
        <Section title="About you">
          <fieldset>
            <legend className="field-label">Activity level before your injury</legend>
            <div className="mt-2 grid gap-2">
              {(Object.entries(ACTIVITY_LEVELS) as [ActivityLevel, string][]).map(([key, label]) => (
                <ChoiceCard
                  key={key}
                  name="activityLevel"
                  checked={values.activityLevel === key}
                  onChange={() => set("activityLevel", key)}
                  invalid={Boolean(errors.activityLevel)}
                >
                  {label}
                </ChoiceCard>
              ))}
            </div>
            <FieldError message={errors.activityLevel} />
          </fieldset>

          <div>
            <label htmlFor="sport" className="field-label">
              Sport or activity you want to get back to (optional)
            </label>
            <input
              id="sport"
              className="field-input"
              placeholder="For example: soccer, tennis, rock climbing, gardening"
              value={values.sport}
              onChange={(e) => set("sport", e.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="mainGoal" className="field-label">
              What&apos;s your main goal?
            </label>
            <textarea
              id="mainGoal"
              rows={2}
              className="field-input"
              placeholder="For example: get back to typing at work without pain, or play in my league next season"
              value={values.mainGoal}
              onChange={(e) => set("mainGoal", e.target.value)}
              aria-invalid={Boolean(errors.mainGoal)}
              maxLength={500}
            />
            <FieldError message={errors.mainGoal} />
          </div>
        </Section>

        {/* Safety check ------------------------------------------------- */}
        <Section
          title="Safety check"
          description="Are you having any of these right now? Check any that apply. If none apply, leave them unchecked."
        >
          <div className="grid gap-2">
            {(Object.entries(EMERGENCY_SYMPTOMS) as [EmergencySymptom, string][]).map(([key, label]) => (
              <label
                key={key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                  values.emergencySymptoms.includes(key)
                    ? "border-red-300 bg-red-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 flex-none accent-red-600"
                  checked={values.emergencySymptoms.includes(key)}
                  onChange={() => toggleSymptom(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label htmlFor="symptomsNotes" className="field-label">
              Anything else we should know? (optional)
            </label>
            <textarea
              id="symptomsNotes"
              rows={3}
              className="field-input"
              placeholder="Current symptoms, restrictions your doctor gave you (like no weight on the leg), other health conditions"
              value={values.symptomsNotes}
              onChange={(e) => set("symptomsNotes", e.target.value)}
              aria-invalid={Boolean(errors.symptomsNotes)}
              maxLength={1000}
            />
            <FieldError message={errors.symptomsNotes} />
          </div>
        </Section>

        {/* Acknowledge and submit -------------------------------------- */}
        <div className="card space-y-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 flex-none accent-teal-700"
              checked={values.acknowledged}
              onChange={(e) => set("acknowledged", e.target.checked)}
              aria-invalid={Boolean(errors.acknowledged)}
              aria-describedby="ack-text"
            />
            <span id="ack-text" className="text-slate-700">
              I understand that RecoverRight gives <strong>educational information, not medical advice</strong>. I
              will review my plan with my doctor or physical therapist before making changes, and I&apos;ll seek care
              right away if I have warning signs.
            </span>
          </label>
          <FieldError message={errors.acknowledged} />

          <button type="submit" className="btn-primary w-full text-lg sm:w-auto">
            Generate my recovery plan
          </button>
          <p className="text-sm text-slate-500">
            Your answers{file ? " and file" : ""} are sent to our AI provider to create the plan. Your plan is saved
            only in this browser.
          </p>
        </div>
      </form>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-slate-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ChoiceCard({
  name,
  checked,
  onChange,
  invalid,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  invalid: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition has-focus-visible:ring-2 has-focus-visible:ring-teal-600 ${
        checked ? "border-teal-600 bg-teal-50 text-teal-950" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 flex-none accent-teal-700"
        aria-invalid={invalid}
      />
      <span>{children}</span>
    </label>
  );
}

function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}
