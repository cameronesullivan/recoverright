"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Reading your answers",
  "Reading your paperwork",
  "Explaining how your injury heals",
  "Mapping out your 20 weeks",
  "Choosing home exercises for each phase",
  "Comparing surgical and non-surgical paths",
  "Checking the evidence on other therapies",
  "Writing questions for your doctor",
  "Putting it all together",
];

export function GeneratingPlan({ hasFile }: { hasFile: boolean }) {
  const steps = hasFile ? STEPS : STEPS.filter((s) => s !== "Reading your paperwork");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }, 9000);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center" role="status" aria-live="polite">
      <div className="relative h-16 w-16" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border-4 border-sky-100" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-teal-600" />
      </div>
      <h2 className="mt-6 text-2xl font-semibold text-slate-900">Building your recovery plan</h2>
      <p className="mt-2 max-w-md text-slate-600">
        This usually takes one to two minutes. Please keep this page open.
      </p>

      <ol className="mt-8 w-full max-w-sm space-y-2 text-left">
        {steps.map((step, i) => (
          <li
            key={step}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              i === index ? "bg-teal-50 font-medium text-teal-900" : i < index ? "text-slate-500" : "text-slate-400"
            }`}
          >
            <span
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${
                i < index ? "bg-emerald-500 text-white" : i === index ? "bg-teal-600 text-white" : "bg-slate-200"
              }`}
              aria-hidden="true"
            >
              {i < index ? "✓" : ""}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
