"use client";

const COLORS = [
  "bg-emerald-500",
  "bg-emerald-500",
  "bg-lime-500",
  "bg-lime-500",
  "bg-yellow-400",
  "bg-yellow-400",
  "bg-amber-500",
  "bg-orange-500",
  "bg-orange-600",
  "bg-red-600",
  "bg-red-700",
];

/** Large 0–10 tap buttons, easy to hit from a distance or with a shaky hand. */
export function PainScale({
  value,
  onSelect,
  label = "How much pain do you feel right now?",
}: {
  value: number | null;
  onSelect: (score: number) => void;
  label?: string;
}) {
  return (
    <fieldset>
      <legend className="text-xl font-semibold sm:text-2xl">{label}</legend>
      <p className="mt-1 text-slate-300">0 means no pain. 10 means the worst pain you can imagine.</p>
      <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-11">
        {COLORS.map((color, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            aria-pressed={value === n}
            aria-label={`Pain ${n} out of 10`}
            className={`flex h-16 items-center justify-center rounded-2xl text-2xl font-bold text-slate-950 transition focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-20 ${color} ${
              value === n ? "ring-4 ring-white" : value === null ? "" : "opacity-60"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
