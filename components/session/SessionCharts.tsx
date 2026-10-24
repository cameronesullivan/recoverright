"use client";

import { useState } from "react";
import type { GuidedSession } from "@/lib/exercises/session";
import { JOINT_METRICS, getTrackingConfig, type JointMetricId } from "@/lib/exercises/tracking";

interface Point {
  label: string;
  value: number;
}

interface LineChartProps {
  title: string;
  points: Point[];
  domain: [number, number];
  ticks: number[];
  unit: string;
  color: string;
  band?: { min: number; max: number; label: string };
  refLine?: { value: number; label: string };
}

const W = 360;
const H = 190;
const PAD = { left: 38, right: 14, top: 14, bottom: 30 };

/** Small dependency-free SVG line chart. */
function LineChart({ title, points, domain, ticks, unit, color, band, refLine }: LineChartProps) {
  const [lo, hi] = domain;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * innerH;
  const summary = points.map((p) => `${p.label}: ${p.value}${unit}`).join(", ");

  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold text-slate-800">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${summary}`}>
        {band && (
          <g>
            <rect
              x={PAD.left}
              y={y(band.max)}
              width={innerW}
              height={Math.max(2, y(band.min) - y(band.max))}
              className="fill-emerald-100"
            />
            <text x={PAD.left + 6} y={y(band.max) + 12} className="fill-emerald-800 text-[10px]">
              {band.label}
            </text>
          </g>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-slate-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500 text-[10px]">
              {t}
              {unit}
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              className="stroke-red-400"
              strokeDasharray="4 3"
              strokeWidth={1.5}
            />
            <text x={W - PAD.right - 2} y={y(refLine.value) - 4} textAnchor="end" className="fill-red-600 text-[10px]">
              {refLine.label}
            </text>
          </g>
        )}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          />
        )}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={4.5} fill="white" stroke={color} strokeWidth={2.5}>
            <title>{`${p.label}: ${p.value}${unit}`}</title>
          </circle>
        ))}
        {points.length > 0 && (
          <>
            <text x={x(0)} y={H - 8} textAnchor={points.length === 1 ? "middle" : "start"} className="fill-slate-500 text-[10px]">
              {points[0].label}
            </text>
            {points.length > 1 && (
              <text x={x(points.length - 1)} y={H - 8} textAnchor="end" className="fill-slate-500 text-[10px]">
                {points[points.length - 1].label}
              </text>
            )}
          </>
        )}
      </svg>
    </figure>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  const step = span > 120 ? 45 : span > 60 ? 30 : span > 30 ? 15 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

export function PainChart({ sessions }: { sessions: GuidedSession[] }) {
  const points = sessions
    .map((s) => {
      const pains = s.exercises.map((e) => e.painScore).filter((p): p is number => p !== null);
      return pains.length ? { label: shortDate(s.endedAt), value: Math.max(...pains) } : null;
    })
    .filter((p): p is Point => p !== null);

  if (points.length === 0) {
    return <EmptyChart title="Pain over time" text="Pain scores you give after each exercise will appear here." />;
  }
  return (
    <div>
      <LineChart
        title="Pain over time (highest score each session)"
        points={points}
        domain={[0, 10]}
        ticks={[0, 5, 10]}
        unit=""
        color="#f59e0b"
        refLine={{ value: 7, label: "7+ = stop" }}
      />
      {points.length === 1 && <p className="mt-1 text-xs text-slate-500">Do another session to see a trend.</p>}
    </div>
  );
}

interface RomSeries {
  key: string;
  label: string;
  target: { min: number; max: number };
  points: Point[];
  lastSessionId: string | null;
}

/** One line per tracked exercise and side, with that exercise's typical target range. */
function romSeries(sessions: GuidedSession[]): RomSeries[] {
  const map = new Map<string, RomSeries>();
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (e.bestAngle === null || !e.trackingId || !e.metric || !(e.metric in JOINT_METRICS)) continue;
      const target = e.targetRange ?? getTrackingConfig(e.trackingId)?.targetRange;
      if (!target) continue;
      const metric = JOINT_METRICS[e.metric as JointMetricId];
      const side = e.side === "left" || e.side === "right" ? `${e.side} ` : "";
      const key = `${e.trackingId}|${e.side ?? ""}`;
      const series = map.get(key) ?? {
        key,
        label: `${e.name} · ${side}${metric.label}`,
        target,
        points: [],
        lastSessionId: null,
      };
      const last = series.points[series.points.length - 1];
      if (last && series.lastSessionId === s.id) {
        // Same exercise twice in one session: keep the better result.
        last.value = metric.higherIsBetter ? Math.max(last.value, e.bestAngle) : Math.min(last.value, e.bestAngle);
      } else {
        series.points.push({ label: shortDate(s.endedAt), value: e.bestAngle });
      }
      series.lastSessionId = s.id;
      map.set(key, series);
    }
  }
  return [...map.values()].sort((a, b) => b.points.length - a.points.length);
}

export function RomChart({ sessions }: { sessions: GuidedSession[] }) {
  const series = romSeries(sessions);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = series.find((s) => s.key === selectedKey) ?? series[0];

  if (!selected) {
    return (
      <EmptyChart
        title="Range of motion over time"
        text="When the camera tracks an exercise, your best angle from each session will appear here."
      />
    );
  }
  const values = selected.points.map((p) => p.value);
  const lo = Math.max(0, Math.floor((Math.min(selected.target.min, ...values) - 10) / 10) * 10);
  const hi = Math.min(190, Math.ceil((Math.max(selected.target.max, ...values) + 10) / 10) * 10);

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {series.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedKey(s.key)}
              aria-pressed={s.key === selected.key}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                s.key === selected.key
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-teal-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <LineChart
        title={`Range of motion: ${selected.label} (best each session)`}
        points={selected.points}
        domain={[lo, hi]}
        ticks={niceTicks(lo, hi)}
        unit="°"
        color="#0f766e"
        band={{ ...selected.target, label: `Typical target ${selected.target.min}–${selected.target.max}°` }}
      />
      <p className="mt-1 text-xs text-slate-500">
        Camera angles are estimates and can vary with camera position. Your PT&apos;s measurements are more accurate.
      </p>
    </div>
  );
}

function EmptyChart({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 text-center text-sm text-slate-500">
        {text}
      </div>
    </div>
  );
}
