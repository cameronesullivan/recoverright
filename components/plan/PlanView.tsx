"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import { EmergencyNotice } from "@/components/EmergencyNotice";
import { PLAN_WEEKS, daysBetween, formatDay, toLocalDay, weekNumber } from "@/lib/dates";
import type { GuidedSession } from "@/lib/exercises/session";
import { planStore, StorageError, type SavedPlan } from "@/lib/storage";
import { GuidedSessionPanel } from "@/components/session/GuidedSessionPanel";
import { PlanChat } from "./PlanChat";
import {
  ExercisesSection,
  LifestyleSection,
  OverviewSection,
  QuestionsSection,
  RedFlagsSection,
  SurgerySection,
  TherapiesSection,
  TimelineSection,
} from "./sections";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "exercises", label: "Home exercises" },
  { id: "surgery", label: "Surgery options" },
  { id: "therapies", label: "Other therapies" },
  { id: "lifestyle", label: "Nutrition & sleep" },
  { id: "redflags", label: "Red flags" },
  { id: "questions", label: "Questions" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; saved: SavedPlan; today: string };

export function PlanView() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [tab, setTab] = useState<TabId>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    planStore
      .get(id)
      .then((saved) => {
        if (!active) return;
        setState(saved ? { kind: "ready", saved, today: toLocalDay(new Date()) } : { kind: "missing" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof StorageError ? error.message : "We couldn't load this plan.",
        });
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (state.kind === "loading") {
    return <p className="py-20 text-center text-slate-500">Loading your plan…</p>;
  }

  if (state.kind === "missing" || state.kind === "error") {
    return (
      <div className="card mx-auto max-w-xl text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {state.kind === "missing" ? "We couldn't find that plan" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-slate-600">
          {state.kind === "missing"
            ? "Plans are saved only in the browser where they were created. It may have been deleted, or it was made on another device."
            : state.message}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/plans" className="btn-secondary">
            My plans
          </Link>
          <Link href="/intake" className="btn-primary">
            Build a new plan
          </Link>
        </div>
      </div>
    );
  }

  const { saved, today } = state;
  const { plan } = saved;
  const rawWeek = daysBetween(saved.planStartDate, today) < 0 ? 1 : weekNumber(saved.planStartDate, today);
  const currentWeek = Math.max(1, rawWeek);

  function selectTab(next: TabId) {
    setTab(next);
    const el = tabsRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  function addSession(session: GuidedSession) {
    setState((s) =>
      s.kind === "ready"
        ? {
            ...s,
            saved: { ...s.saved, sessions: [...s.saved.sessions.filter((x) => x.id !== session.id), session] },
          }
        : s,
    );
  }

  if (plan.urgentCare.needed) {
    return <EmergencyNotice reasons={plan.urgentCare.reasons} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/plans" className="text-sm font-medium text-teal-800 hover:underline print:hidden">
            ← My plans
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{plan.title}</h1>
          <p className="mt-2 max-w-3xl text-lg text-slate-600">{plan.summary}</p>
          <p className="mt-3 text-sm text-slate-500">
            Week 1 started {formatDay(saved.planStartDate)} ·{" "}
            {currentWeek > PLAN_WEEKS ? "20-week plan complete" : `You're in week ${currentWeek} of ${PLAN_WEEKS}`}
          </p>
        </div>
        <button type="button" onClick={() => window.print()} className="btn-secondary flex-none print:hidden">
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M5 2h10v4H5V2Zm-2 5h14a2 2 0 0 1 2 2v5h-3v4H4v-4H1V9a2 2 0 0 1 2-2Zm3 6v3h8v-3H6Z" />
          </svg>
          Print / Save as PDF
        </button>
      </div>

      <Disclaimer />

      <div
        ref={tabsRef}
        className="sticky top-0 z-10 -mx-4 scroll-mt-2 bg-slate-50/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0 print:hidden"
      >
        <div role="tablist" aria-label="Plan sections" className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => selectTab(t.id)}
              className={`flex-none rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
                tab === t.id
                  ? "bg-teal-700 text-white shadow-sm"
                  : t.id === "redflags"
                    ? "text-red-700 hover:bg-red-50"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {TABS.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          className={`${tab === t.id ? "" : "hidden"} print:mb-10 print:block`}
        >
          {t.id === "overview" && (
            <OverviewSection
              plan={plan}
              intake={saved.intake}
              planStartDate={saved.planStartDate}
              planStartAnchor={saved.planStartAnchor}
            />
          )}
          {t.id === "timeline" && <TimelineSection plan={plan} currentWeek={currentWeek} />}
          {t.id === "exercises" && (
            <div className="space-y-6">
              <GuidedSessionPanel
                saved={saved}
                currentWeek={currentWeek}
                today={today}
                onSessionSaved={addSession}
              />
              <ExercisesSection plan={plan} currentWeek={currentWeek} />
            </div>
          )}
          {t.id === "surgery" && <SurgerySection plan={plan} />}
          {t.id === "therapies" && <TherapiesSection plan={plan} />}
          {t.id === "lifestyle" && <LifestyleSection plan={plan} />}
          {t.id === "redflags" && <RedFlagsSection plan={plan} />}
          {t.id === "questions" && <QuestionsSection plan={plan} />}
        </div>
      ))}

      <PlanChat saved={saved} />
    </div>
  );
}
