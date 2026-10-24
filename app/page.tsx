import Link from "next/link";

const FEATURES = [
  {
    title: "Understand your injury",
    body: "A plain-language explanation of what's injured and what your body is doing as it heals.",
  },
  {
    title: "A 20-week roadmap",
    body: "Recovery phases with goals and milestones, so you know what's normal and what comes next.",
  },
  {
    title: "Home exercises",
    body: "Exercises for each phase with sets, reps, step-by-step instructions, and signs to stop.",
  },
  {
    title: "Surgery, explained",
    body: "When surgery is usually recommended, the pros and cons of each path, and questions for your surgeon.",
  },
  {
    title: "Honest look at new therapies",
    body: "Red light, hyperbaric oxygen, peptides like BPC-157 and more, each labeled by how strong the evidence is.",
  },
  {
    title: "Questions for your care team",
    body: "A ready-made list to bring to your doctor and physical therapist, plus red flags to watch for.",
  },
];

const STEPS = [
  { title: "Tell us about your injury", body: "Type your diagnosis or upload a photo or PDF of your paperwork." },
  { title: "Get your plan in about a minute", body: "We build a personalized 20-week plan you can save and print." },
  { title: "Talk it over with your doctor", body: "Bring the plan and questions to your next appointment." },
];

export default function Home() {
  return (
    <>
      <section className="bg-linear-to-b from-sky-100 via-sky-50 to-slate-50">
        <div className="mx-auto max-w-5xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24">
          <p className="inline-flex rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-teal-800 ring-1 ring-teal-200">
            For broken bones, torn ligaments, sprains, and more
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Sent home with a referral and not much else? Get a clear plan for your recovery.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            RecoverRight turns your diagnosis into a personalized 5-month recovery plan, so you can take an active
            part in healing and have better conversations with your doctor and physical therapist.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/intake" className="btn-primary text-lg">
              Build my recovery plan
            </Link>
            <Link href="/plans" className="btn-secondary justify-center">
              View my saved plans
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">Free. No account needed. Plans are saved only in this browser.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="section-title">What&apos;s in your plan</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <div className="mb-3 h-1.5 w-10 rounded-full bg-linear-to-r from-teal-500 to-sky-400" />
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-6 sm:px-6">
        <h2 className="section-title">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex gap-4">
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1 text-slate-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-emerald-950">Built to support your care team, not replace it</h2>
          <p className="mt-3 max-w-3xl text-emerald-900">
            Everything in RecoverRight is educational information to discuss with your doctor. We screen for warning
            signs, tell you when to seek care right away, and are upfront about which treatments have strong evidence
            and which don&apos;t.
          </p>
          <Link href="/intake" className="btn-primary mt-6">
            Build my recovery plan
          </Link>
        </div>
      </section>
    </>
  );
}
