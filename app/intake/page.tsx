import type { Metadata } from "next";
import { IntakeForm } from "@/components/IntakeForm";

export const metadata: Metadata = {
  title: "Build my recovery plan",
};

export default function IntakePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Build your recovery plan</h1>
      <p className="mt-2 text-lg text-slate-600">
        Answer a few questions. It takes about 3 minutes, and your plan is ready about a minute or two later.
      </p>
      <div className="mt-8">
        <IntakeForm />
      </div>
    </div>
  );
}
