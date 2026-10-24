"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDay } from "@/lib/dates";
import { planStore, StorageError, type PlanSummary } from "@/lib/storage";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; plans: PlanSummary[] };

export function PlansList() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    planStore
      .list()
      .then((plans) => active && setState({ kind: "ready", plans }))
      .catch((error: unknown) =>
        active &&
        setState({
          kind: "error",
          message: error instanceof StorageError ? error.message : "We couldn't load your saved plans.",
        }),
      );
    return () => {
      active = false;
    };
  }, []);

  async function remove(plan: PlanSummary) {
    if (!window.confirm(`Delete "${plan.title}"? This can't be undone.`)) return;
    try {
      await planStore.remove(plan.id);
      setState({ kind: "ready", plans: await planStore.list() });
    } catch (error) {
      window.alert(error instanceof StorageError ? error.message : "We couldn't delete that plan.");
    }
  }

  if (state.kind === "loading") {
    return <p className="text-slate-500">Loading your plans…</p>;
  }

  if (state.kind === "error") {
    return (
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
        {state.message}
      </div>
    );
  }

  if (state.plans.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-lg font-semibold text-slate-900">No saved plans yet</p>
        <p className="mt-2 text-slate-600">Plans you create are saved here, in this browser.</p>
        <Link href="/intake" className="btn-primary mt-6">
          Build my recovery plan
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.plans.map((plan) => (
        <li key={plan.id} className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link
              href={`/plans/${plan.id}`}
              className="text-lg font-semibold text-slate-900 hover:text-teal-800 hover:underline"
            >
              {plan.title}
            </Link>
            <p className="mt-1 text-sm text-slate-600">
              {plan.injuryName} · Week 1 starts {formatDay(plan.planStartDate)}
            </p>
            <p className="text-sm text-slate-500">
              Created {new Date(plan.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
          </div>
          <div className="flex flex-none gap-2">
            <Link href={`/plans/${plan.id}`} className="btn-secondary">
              Open
            </Link>
            <button
              type="button"
              onClick={() => remove(plan)}
              className="btn-secondary hover:border-red-400 hover:text-red-700"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
