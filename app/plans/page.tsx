import type { Metadata } from "next";
import Link from "next/link";
import { PlansList } from "@/components/PlansList";

export const metadata: Metadata = {
  title: "My plans",
};

export default function PlansPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">My plans</h1>
          <p className="mt-2 text-slate-600">
            Saved in this browser only. Clearing your browser data or switching devices will remove them.
          </p>
        </div>
        <Link href="/intake" className="btn-secondary">
          + New plan
        </Link>
      </div>
      <div className="mt-8">
        <PlansList />
      </div>
    </div>
  );
}
