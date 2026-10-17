"use client";

import { Plane, Ship } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type BatchRow = {
  id: string;
  code: string;
  mode: "air" | "air_sensitive" | "sea";
  modeLabel: string;
  cutoff: string;
  daysLeft: number;
  pickup: string | null;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "air", label: "Air" },
  { id: "sea", label: "Sea" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

/** Upcoming batches with the compact segmented filter from the modal design. */
export function BatchList({ rows }: { rows: BatchRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const index = FILTERS.findIndex((f) => f.id === filter);
  const shown = rows.filter((r) => filter === "all" || (filter === "sea" ? r.mode === "sea" : r.mode !== "sea"));

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Filter batches by shipping mode"
        className="relative grid w-full grid-cols-3 rounded-xl border border-white/10 bg-white/5 p-1 sm:w-64"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white/12 shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-transform duration-500 ease-(--ease-out-expo) motion-reduce:transition-none"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={f.id === filter}
            onClick={() => setFilter(f.id)}
            className={cn(
              "relative z-10 min-h-11 rounded-lg text-sm sm:min-h-0 sm:py-1.5 transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              f.id === filter ? "text-white" : "text-white/55 hover:text-white",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-xl border border-white/8 bg-white/2 p-5 text-sm text-white/60">
          No {filter === "all" ? "" : `${filter} `}batches are scheduled right now. Orders placed now join the first one.
        </p>
      ) : (
        <ul key={filter} className="mt-6 overflow-hidden rounded-xl border border-white/8">
          {shown.map((b, i) => {
            const Icon = b.mode === "sea" ? Ship : Plane;
            return (
              <li
                key={b.id}
                style={{ "--d": i }}
                className="batch-row-in flex items-center gap-4 border-b border-white/8 bg-white/2 px-4 py-4 last:border-b-0"
              >
                <span className="icon-chip">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">
                    {b.code} <span className="ml-1 hidden text-xs font-normal text-white/45 sm:inline">{b.modeLabel}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-white/60">
                    Cutoff {b.cutoff}
                    {b.pickup ? <span className="text-white/40"> · Pickup {b.pickup}</span> : null}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 tabular-nums">
                  {b.daysLeft <= 0 ? "Today" : b.daysLeft === 1 ? "1 day" : `${b.daysLeft} days`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
