import { EVIDENCE_LABELS, type EvidenceLevel } from "@/lib/therapies";

const STYLES: Record<EvidenceLevel, string> = {
  strong: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  emerging: "bg-amber-100 text-amber-900 ring-amber-300",
  experimental: "bg-rose-100 text-rose-900 ring-rose-300",
};

const DOTS: Record<EvidenceLevel, number> = { strong: 3, emerging: 2, experimental: 1 };

export function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${STYLES[level]}`}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-2 w-2 rounded-full ${n <= DOTS[level] ? "bg-current" : "bg-current opacity-20"}`}
          />
        ))}
      </span>
      {EVIDENCE_LABELS[level]}
    </span>
  );
}
