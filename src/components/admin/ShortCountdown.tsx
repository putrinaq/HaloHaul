"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** "2d 4h left" until a cutoff (server clock first, then the browser's). */
export function ShortCountdown({ target, serverNow, className }: { target: string | Date; serverNow: number; className?: string }) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = end - now;
  if (ms <= 0) return <span className={cn("text-warning", className)}>cutoff passed</span>;
  const h = Math.floor(ms / 3_600_000);
  const label = h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h >= 1 ? `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}m left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
  return <span className={cn(h < 24 ? "text-warning" : "text-white/70", "tabular-nums", className)}>{label}</span>;
}

/** Orders vs the batch minimum. */
export function MinProgress({ count, min }: { count: number; min: number }) {
  const pct = Math.min(100, Math.round((count / Math.max(1, min)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-white/55">
        <span className="tabular-nums">
          {count}/{min} orders
        </span>
        <span>{count >= min ? "minimum reached" : `${min - count} to go`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={count} aria-label="Orders toward minimum">
        <div className={cn("h-full rounded-full", count >= min ? "bg-success" : "bg-sky-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
