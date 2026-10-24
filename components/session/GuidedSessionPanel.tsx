"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { toLocalDay } from "@/lib/dates";
import {
  buildStep,
  describeDosage,
  estimateMinutes,
  injuredSide,
  todaysPhase,
  type GuidedSession,
} from "@/lib/exercises/session";
import type { SavedPlan } from "@/lib/storage";
import { weekLabel } from "@/components/plan/sections";
import { PainChart, RomChart } from "./SessionCharts";

// The session (camera, MediaPipe, timers) only loads when someone starts it.
const SessionRunner = dynamic(() => import("./SessionRunner"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 text-xl text-white" role="status">
      Opening your session…
    </div>
  ),
});

const MODE_BADGE = {
  camera: { text: "Camera counts reps", className: "bg-teal-100 text-teal-900" },
  paced: { text: "Timed reps", className: "bg-sky-100 text-sky-900" },
  hold: { text: "Hold timer", className: "bg-sky-100 text-sky-900" },
  duration: { text: "Timer", className: "bg-sky-100 text-sky-900" },
} as const;

export function GuidedSessionPanel({
  saved,
  currentWeek,
  today,
  onSessionSaved,
}: {
  saved: SavedPlan;
  currentWeek: number;
  /** Today's date (YYYY-MM-DD, local). */
  today: string;
  onSessionSaved: (session: GuidedSession) => void;
}) {
  const [open, setOpen] = useState(false);
  const todays = todaysPhase(saved.plan, currentWeek);
  const exercises = todays?.phase.exercises ?? [];
  const steps = exercises.map((e) => buildStep(e, true));
  const side = injuredSide(saved.intake.diagnosisText, saved.plan.injuryName, saved.plan.title);
  const minutes = estimateMinutes(steps);
  const sessions = useMemo(
    () => [...saved.sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt)),
    [saved.sessions],
  );
  const doneToday = sessions.some((s) => toLocalDay(new Date(s.endedAt)) === today);

  return (
    <div className="space-y-6">
      <section className="card border-teal-200 bg-linear-to-br from-teal-50 via-white to-sky-50 print:hidden" aria-labelledby="guided-title">
        {!todays || steps.length === 0 ? (
          <>
            <h2 id="guided-title" className="section-title">
              Start today&apos;s guided session
            </h2>
            <p className="mt-2 text-slate-600">
              This phase of your plan doesn&apos;t list home exercises. Follow your care team&apos;s guidance.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-teal-800">
                  Week {todays.week} · Phase {todays.phaseIndex + 1}: {todays.phase.name} ({weekLabel(todays.phase)})
                </p>
                <h2 id="guided-title" className="section-title mt-1">
                  Start today&apos;s guided session
                </h2>
                <p className="mt-2 max-w-2xl text-slate-600">
                  About {minutes} minute{minutes === 1 ? "" : "s"} · {steps.length} exercise{steps.length === 1 ? "" : "s"}.
                  A text coach walks you through each set. If you turn on your camera, it counts reps and checks your form.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(true)} className="btn-primary flex-none text-lg">
                Start session
              </button>
            </div>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {steps.map((step, i) => {
                const badge = MODE_BADGE[step.mode];
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{step.exercise.name}</p>
                      <p className="text-sm text-slate-500">{describeDosage(step)}</p>
                    </div>
                    <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                      {badge.text}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm text-slate-500">
              The camera is optional, and video never leaves your device. Exercises without visible movement use a timer.
              {doneToday && <span className="ml-1 font-medium text-emerald-700">✓ You&apos;ve done a session today.</span>}
            </p>
          </>
        )}
      </section>

      <SessionHistory sessions={sessions} />

      {open && todays && (
        <SessionRunner
          planId={saved.id}
          exercises={exercises}
          week={todays.week}
          phaseName={todays.phase.name}
          side={side}
          onClose={() => setOpen(false)}
          onSaved={onSessionSaved}
        />
      )}
    </div>
  );
}

function SessionHistory({ sessions }: { sessions: GuidedSession[] }) {
  const recent = [...sessions].reverse().slice(0, 8);
  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title" className="text-lg font-semibold text-slate-900">
        Your session history
      </h2>
      {sessions.length === 0 ? (
        <p className="mt-2 text-slate-600">
          No guided sessions yet. After your first one, you&apos;ll see your pain and range of motion over time here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <PainChart sessions={sessions} />
            <RomChart sessions={sessions} />
          </div>
          <ul className="mt-6 divide-y divide-slate-100">
            {recent.map((s) => {
              const done = s.exercises.filter((e) => e.status === "completed").length;
              const reps = s.exercises.reduce((sum, e) => sum + e.repsCompleted, 0);
              const pains = s.exercises.map((e) => e.painScore).filter((p): p is number => p !== null);
              return (
                <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="font-medium text-slate-900">
                    {new Date(s.endedAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    <span className="ml-2 font-normal text-slate-500">Week {s.planWeek}</span>
                  </span>
                  <span className="text-slate-600">
                    {done}/{s.exercises.length} exercises · {reps} reps · highest pain{" "}
                    {pains.length ? `${Math.max(...pains)}/10` : "not recorded"}
                    {s.exercises.some((e) => e.hurtReported) && " · stopped for pain"}
                    {s.usedCamera ? " · camera" : " · timers"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
