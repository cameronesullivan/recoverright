"use client";

import { useState, type ReactNode } from "react";
import { ACTIVITY_LEVELS, SURGERY_STATUSES, type Intake } from "@/lib/intake";
import { PLAN_WEEKS, formatDay } from "@/lib/dates";
import type { Exercise, Phase, RecoveryPlan } from "@/lib/plan-schema";
import { EVIDENCE_DESCRIPTIONS, getTherapy, type EvidenceLevel } from "@/lib/therapies";
import { EvidenceBadge } from "./EvidenceBadge";

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

export function SectionHeading({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="section-title">{title}</h2>
      {intro && <p className="mt-2 max-w-3xl text-slate-600">{intro}</p>}
    </div>
  );
}

function BulletList({ items, className = "" }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={`space-y-2 ${className}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-teal-500" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-900">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-lg font-semibold text-slate-900">{children}</h3>;
}

export function weekLabel(phase: Pick<Phase, "weekStart" | "weekEnd">) {
  return phase.weekStart === phase.weekEnd ? `Week ${phase.weekStart}` : `Weeks ${phase.weekStart}–${phase.weekEnd}`;
}

export function phaseIndexForWeek(phases: Phase[], week: number): number {
  const i = phases.findIndex((p) => week >= p.weekStart && week <= p.weekEnd);
  return i === -1 ? (week > PLAN_WEEKS ? phases.length - 1 : 0) : i;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewSection({
  plan,
  intake,
  planStartDate,
  planStartAnchor,
}: {
  plan: RecoveryPlan;
  intake: Intake;
  planStartDate: string;
  planStartAnchor: string;
}) {
  const { overview } = plan;
  return (
    <div className="space-y-6">
      <SectionHeading title="Your injury, explained" />

      <div className="card">
        <SubHeading>What it is</SubHeading>
        <p className="leading-relaxed whitespace-pre-line">{overview.whatItIs}</p>
        <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-950">
          <strong>Typical recovery:</strong> {overview.typicalRecoveryTime}
        </p>
      </div>

      <div className="card">
        <SubHeading>How your body heals</SubHeading>
        <ol className="relative space-y-5 border-l-2 border-teal-200 pl-6">
          {overview.howItHeals.map((stage, i) => (
            <li key={i} className="relative">
              <span
                className="absolute top-1.5 -left-[33px] h-4 w-4 rounded-full border-2 border-white bg-teal-500 ring-2 ring-teal-200"
                aria-hidden="true"
              />
              <p className="font-semibold text-slate-900">
                {stage.stage} <span className="font-normal text-slate-500">· {stage.timing}</span>
              </p>
              <p className="mt-1 text-slate-700">{stage.description}</p>
            </li>
          ))}
        </ol>
      </div>

      {overview.factorsThatAffectHealing.length > 0 && (
        <div className="card">
          <SubHeading>What can affect your healing</SubHeading>
          <BulletList items={overview.factorsThatAffectHealing} />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <SubHeading>What you told us</SubHeading>
          <dl className="space-y-2 text-sm">
            <Detail label="Diagnosis" value={intake.diagnosisText || "From your uploaded paperwork"} />
            {intake.uploadedFileName && <Detail label="Paperwork" value={intake.uploadedFileName} />}
            <Detail label="Date of injury" value={formatDay(intake.dateOfInjury)} />
            <Detail label="Surgery" value={SURGERY_STATUSES[intake.surgeryStatus]} />
            {intake.surgeryDate && <Detail label="Surgery date" value={formatDay(intake.surgeryDate)} />}
            <Detail label="Age" value={String(intake.age)} />
            <Detail label="Activity level" value={ACTIVITY_LEVELS[intake.activityLevel]} />
            {intake.sport && <Detail label="Sport" value={intake.sport} />}
            <Detail label="Pain level" value={`${intake.painLevel} / 10`} />
            <Detail label="Main goal" value={intake.mainGoal} />
            <Detail label="Week 1 starts" value={`${formatDay(planStartDate)} (${planStartAnchor})`} />
          </dl>
        </div>

        {(plan.paperworkFindings || plan.assumptions.length > 0) && (
          <div className="card">
            {plan.paperworkFindings && (
              <>
                <SubHeading>What we read in your paperwork</SubHeading>
                <p className="whitespace-pre-line text-slate-700">{plan.paperworkFindings}</p>
              </>
            )}
            {plan.assumptions.length > 0 && (
              <div className={plan.paperworkFindings ? "mt-6" : ""}>
                <SubHeading>Assumptions we made</SubHeading>
                <p className="mb-3 text-sm text-slate-500">
                  Check these with your doctor. If any are wrong, parts of the plan may not apply to you.
                </p>
                <BulletList items={plan.assumptions} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="col-span-2 text-slate-800">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function TimelineSection({ plan, currentWeek }: { plan: RecoveryPlan; currentWeek: number }) {
  const current = phaseIndexForWeek(plan.phases, currentWeek);
  const finished = currentWeek > PLAN_WEEKS;
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Your 20-week timeline"
        intro="Everyone heals at a different pace. Use the milestones, not just the calendar, and let your care team decide when you're ready to move on."
      />

      <div className="card">
        <div className="flex items-center justify-between text-sm font-medium text-slate-600">
          <span>Week 1</span>
          <span className="text-teal-800">
            {finished ? "You've reached the end of the 20 weeks" : `You're in week ${currentWeek}`}
          </span>
          <span>Week 20</span>
        </div>
        <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          {plan.phases.map((phase, i) => (
            <div
              key={i}
              className={`h-full border-r-2 border-white last:border-r-0 ${
                ["bg-sky-300", "bg-teal-300", "bg-emerald-300", "bg-cyan-300", "bg-sky-400"][i % 5]
              }`}
              style={{ width: `${((phase.weekEnd - phase.weekStart + 1) / PLAN_WEEKS) * 100}%` }}
            />
          ))}
        </div>
        <div className="relative mt-1 h-3" aria-hidden="true">
          <div
            className="absolute -top-1 h-0 w-0 -translate-x-1/2 border-x-[7px] border-b-[9px] border-x-transparent border-b-slate-800"
            style={{ left: `${((Math.min(currentWeek, PLAN_WEEKS) - 0.5) / PLAN_WEEKS) * 100}%` }}
          />
        </div>
      </div>

      <ol className="space-y-4">
        {plan.phases.map((phase, i) => (
          <li
            key={i}
            className={`card ${i === current && !finished ? "border-teal-400 ring-2 ring-teal-100" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-900">
                {weekLabel(phase)}
              </span>
              {i === current && !finished && (
                <span className="rounded-full bg-teal-700 px-3 py-1 text-sm font-semibold text-white">
                  You are here
                </span>
              )}
            </div>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">
              Phase {i + 1}: {phase.name}
            </h3>
            <p className="mt-2 text-slate-700">{phase.focus}</p>
            <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-slate-700">
              <strong className="text-slate-900">What to expect:</strong> {phase.whatToExpect}
            </p>
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              <div>
                <p className="mb-2 font-semibold text-slate-900">Goals</p>
                <BulletList items={phase.goals} />
              </div>
              <div>
                <p className="mb-2 font-semibold text-slate-900">Milestones</p>
                <BulletList items={phase.milestones} />
              </div>
              <div>
                <p className="mb-2 font-semibold text-slate-900">Be careful with</p>
                <BulletList items={phase.precautions} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home exercises
// ---------------------------------------------------------------------------

export function ExercisesSection({ plan, currentWeek }: { plan: RecoveryPlan; currentWeek: number }) {
  const [selected, setSelected] = useState(() => phaseIndexForWeek(plan.phases, currentWeek));
  const current = phaseIndexForWeek(plan.phases, currentWeek);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Home exercise routine"
        intro="Get your doctor's or physical therapist's OK before starting, especially for the injured area. If your PT gives you different exercises, follow theirs."
      />

      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-950">Stop exercising and contact your care team if you notice:</p>
        <BulletList items={plan.stopExerciseWarningSigns} className="mt-3 text-red-950" />
      </div>

      {plan.homeExerciseGuidance.length > 0 && (
        <div className="card">
          <SubHeading>Ground rules</SubHeading>
          <BulletList items={plan.homeExerciseGuidance} />
        </div>
      )}

      <div className="print:hidden">
        <p className="mb-2 text-sm font-medium text-slate-600">Choose a phase:</p>
        <div className="flex flex-wrap gap-2">
          {plan.phases.map((phase, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                selected === i
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
              }`}
            >
              {weekLabel(phase)}
              {i === current ? " · now" : ""}
            </button>
          ))}
        </div>
      </div>

      {plan.phases.map((phase, i) => (
        <div key={i} className={selected === i ? "" : "hidden print:block"}>
          <h3 className="mb-4 text-xl font-semibold text-slate-900">
            Phase {i + 1}: {phase.name} <span className="font-normal text-slate-500">({weekLabel(phase)})</span>
          </h3>
          {phase.exercises.length === 0 ? (
            <p className="card text-slate-600">No specific exercises for this phase. Follow your care team&apos;s guidance.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {phase.exercises.map((exercise, j) => (
                <ExerciseCard key={j} exercise={exercise} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <article className="card">
      <h4 className="text-lg font-semibold text-slate-900">{exercise.name}</h4>
      <p className="mt-1 text-slate-600">{exercise.purpose}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ["Sets", exercise.sets],
          ["Reps", exercise.reps],
          ["How often", exercise.frequency],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-emerald-50 px-2 py-2">
            <dt className="text-xs font-medium tracking-wide text-emerald-700 uppercase">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-emerald-950">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 mb-2 text-sm font-semibold text-slate-900">How to do it</p>
      <NumberedList items={exercise.steps} />
      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <strong>Safety:</strong> {exercise.safetyNote}
      </p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Surgery
// ---------------------------------------------------------------------------

export function SurgerySection({ plan }: { plan: RecoveryPlan }) {
  const { surgery } = plan;
  const paths = [
    { title: "Non-surgical path", data: surgery.nonSurgical, tone: "border-sky-200 bg-sky-50" },
    { title: "Surgical path", data: surgery.surgical, tone: "border-emerald-200 bg-emerald-50" },
  ];
  return (
    <div className="space-y-6">
      <SectionHeading title="Surgical vs. non-surgical treatment" />

      <div className="card">
        <SubHeading>Your situation</SubHeading>
        <p className="whitespace-pre-line text-slate-700">{surgery.yourSituation}</p>
      </div>

      <div className="card">
        <SubHeading>When surgery is usually recommended</SubHeading>
        <BulletList items={surgery.whenSurgeryIsRecommended} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {paths.map(({ title, data, tone }) => (
          <div key={title} className={`rounded-2xl border p-5 sm:p-6 ${tone} print:break-inside-avoid`}>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-slate-700">{data.description}</p>
            <p className="mt-4 mb-2 font-semibold text-slate-900">Pros</p>
            <BulletList items={data.pros} />
            <p className="mt-4 mb-2 font-semibold text-slate-900">Cons and risks</p>
            <BulletList items={data.cons} />
            <p className="mt-4 rounded-xl bg-white/70 px-3 py-2 text-sm">
              <strong>Typical recovery:</strong> {data.typicalRecovery}
            </p>
          </div>
        ))}
      </div>

      <div className="card">
        <SubHeading>Questions to ask your surgeon</SubHeading>
        <NumberedList items={surgery.questionsForSurgeon} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alternative and emerging therapies
// ---------------------------------------------------------------------------

export function TherapiesSection({ plan }: { plan: RecoveryPlan }) {
  const items = plan.alternativeTherapies
    .map((item) => ({ item, therapy: getTherapy(item.therapyId) }))
    .filter((x) => x.therapy !== undefined);
  const levels: EvidenceLevel[] = ["strong", "emerging", "experimental"];

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Alternative and emerging therapies"
        intro="You may hear about these from friends, clinics, or online. Here is an honest summary of what the research shows. None of them replace your core treatment and exercises. Talk with your doctor before trying any of them."
      />

      <div className="card">
        <p className="mb-3 font-semibold text-slate-900">How to read the evidence labels</p>
        <ul className="space-y-3">
          {levels.map((level) => (
            <li key={level} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="sm:w-72 sm:flex-none">
                <EvidenceBadge level={level} />
              </span>
              <span className="text-sm text-slate-600">{EVIDENCE_DESCRIPTIONS[level]}</span>
            </li>
          ))}
        </ul>
      </div>

      {items.map(({ item, therapy }) =>
        therapy ? (
          <article key={therapy.id} className="card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{therapy.name}</h3>
                <p className="text-sm text-slate-500">
                  {therapy.category}
                  {therapy.alsoKnownAs.length > 0 && ` · Also called ${therapy.alsoKnownAs.join(", ")}`}
                </p>
              </div>
              <EvidenceBadge level={therapy.evidenceLevel} />
            </div>

            <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-sky-950">
              <strong>Why it may come up for you:</strong> {item.whyRelevant}
            </p>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-2 font-semibold text-slate-900">What the research shows</p>
                <p className="text-slate-700">{therapy.evidenceSummary}</p>
              </div>
              <div>
                <p className="mb-2 font-semibold text-slate-900">Known risks</p>
                <BulletList items={[...therapy.risks]} />
              </div>
            </div>

            <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold text-slate-900">Typical cost</dt>
                <dd className="mt-1 text-sm text-slate-700">{therapy.costRange}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-slate-900">Regulatory status</dt>
                <dd className="mt-1 text-sm text-slate-700">{therapy.regulatoryStatus}</dd>
              </div>
            </dl>

            {therapy.athleteNote && (
              <p className="mt-4 rounded-xl bg-violet-50 px-4 py-2 text-sm text-violet-950">
                <strong>For athletes:</strong> {therapy.athleteNote}
              </p>
            )}
            {therapy.unapproved && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-950">
                <strong>Not FDA-approved for this use.</strong> RecoverRight does not provide dosing or sourcing
                information for unapproved products.
              </p>
            )}
          </article>
        ) : null,
      )}

      <p className="text-sm text-slate-500">
        Cost estimates are rough U.S. ranges and vary by location and provider. Evidence summaries come from
        RecoverRight&apos;s curated list and describe the research in general terms.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lifestyle
// ---------------------------------------------------------------------------

export function LifestyleSection({ plan }: { plan: RecoveryPlan }) {
  const groups = [
    { title: "Nutrition", items: plan.lifestyle.nutrition, color: "bg-emerald-100 text-emerald-900" },
    { title: "Sleep", items: plan.lifestyle.sleep, color: "bg-sky-100 text-sky-900" },
    { title: "Everyday habits", items: plan.lifestyle.habits, color: "bg-teal-100 text-teal-900" },
  ];
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Nutrition, sleep, and lifestyle"
        intro="Healing takes energy and building blocks. These everyday factors make a real difference. Ask your doctor before starting any supplement."
      />
      {groups.map((group) => (
        <div key={group.title} className="card">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${group.color}`}>{group.title}</span>
          <ul className="mt-4 space-y-4">
            {group.items.map((tip, i) => (
              <li key={i}>
                <p className="font-semibold text-slate-900">{tip.tip}</p>
                <p className="mt-0.5 text-slate-600">{tip.why}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Red flags
// ---------------------------------------------------------------------------

export function RedFlagsSection({ plan }: { plan: RecoveryPlan }) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Red flags" intro="Know these warning signs. Don't wait for your next appointment." />
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 sm:p-6">
        <h3 className="text-lg font-bold text-red-950">Call 911 or go to the ER now if you have:</h3>
        <BulletList items={plan.redFlags.goToERNow} className="mt-3 text-red-950" />
      </div>
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 sm:p-6">
        <h3 className="text-lg font-bold text-amber-950">Call your doctor&apos;s office within a day if you have:</h3>
        <BulletList items={plan.redFlags.callDoctorSoon} className="mt-3 text-amber-950" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function QuestionsSection({ plan }: { plan: RecoveryPlan }) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Questions to bring to your appointments"
        intro="Print this page or save it as a PDF and bring it with you. Jot down the answers as you go."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <SubHeading>For your doctor</SubHeading>
          <NumberedList items={plan.questionsForDoctor} />
        </div>
        <div className="card">
          <SubHeading>For your physical therapist</SubHeading>
          <NumberedList items={plan.questionsForPT} />
        </div>
      </div>
    </div>
  );
}
