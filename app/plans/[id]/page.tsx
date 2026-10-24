import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanView } from "@/components/plan/PlanView";

export const metadata: Metadata = {
  title: "Your recovery plan",
};

// Plans live in the browser's storage, so this page renders on the client.
export default function PlanPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <Suspense fallback={<p className="py-20 text-center text-slate-500">Loading your plan…</p>}>
        <PlanView />
      </Suspense>
    </div>
  );
}
