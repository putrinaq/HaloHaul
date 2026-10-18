import { TZDate } from "@date-fns/tz";
import { addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, gte, lte, or } from "drizzle-orm";
import { PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { batches } from "@/db/schema";
import { cn } from "@/lib/utils";
import { TZ } from "@/lib/format";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Calendar" };

type View = "month" | "week";
interface CalEvent {
  batchId: string;
  code: string;
  kind: "cutoff" | "pickup";
  at: Date;
  mode: string;
}

export default function CalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Calendar" subtitle="Batch cutoffs and pickup windows (Malaysia time). Tap one to open its batch." />
      <Suspense fallback={<div className="mt-6 h-128 animate-pulse rounded-2xl bg-white/5" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function load(view: View, dateParam: string | undefined) {
  await requireAdmin();
  const today = new TZDate(Date.now(), TZ);
  const anchor = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new TZDate(`${dateParam}T12:00:00`, TZ) : today;
  const from = view === "month" ? startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }) : startOfWeek(anchor, { weekStartsOn: 1 });
  const to = view === "month" ? endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }) : endOfWeek(anchor, { weekStartsOn: 1 });
  const rows = await getDb()
    .select()
    .from(batches)
    .where(or(and(gte(batches.cutoffAt, from), lte(batches.cutoffAt, to)), and(gte(batches.pickupStartsAt, from), lte(batches.pickupStartsAt, to))));
  const events: CalEvent[] = rows.flatMap((b) => [
    { batchId: b.id, code: b.code, kind: "cutoff" as const, at: b.cutoffAt, mode: b.mode },
    ...(b.pickupStartsAt ? [{ batchId: b.id, code: b.code, kind: "pickup" as const, at: b.pickupStartsAt, mode: b.mode }] : []),
  ]);
  return { anchor, from, to, today, events };
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/admin/calendar">["searchParams"] }) {
  const sp = await searchParams;
  const view: View = sp.view === "week" ? "week" : "month";
  const { anchor, from, to, today, events } = await load(view, typeof sp.date === "string" ? sp.date : undefined);
  const days = eachDayOfInterval({ start: from, end: to });
  const key = (d: Date) => format(new TZDate(d.getTime(), TZ), "yyyy-MM-dd");
  const todayKey = key(today);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events.sort((a, b) => a.at.getTime() - b.at.getTime())) byDay.set(key(e.at), [...(byDay.get(key(e.at)) ?? []), e]);
  const prev = view === "month" ? addMonths(anchor, -1) : addWeeks(anchor, -1);
  const next = view === "month" ? addMonths(anchor, 1) : addWeeks(anchor, 1);
  const href = (d: Date, v: View = view) => `/admin/calendar?view=${v}&date=${format(d, "yyyy-MM-dd")}`;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(prev)} aria-label="Previous" className="admin-btn-secondary w-11 px-0 sm:w-10">
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
          <Link href={href(next)} aria-label="Next" className="admin-btn-secondary w-11 px-0 sm:w-10">
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <h2 className="ml-2 text-xl font-medium">{view === "month" ? format(anchor, "MMMM yyyy") : `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`}</h2>
        </div>
        <div className="flex gap-2">
          <Link href={href(today)} className="admin-chip">
            Today
          </Link>
          <Link href={href(anchor, "month")} aria-current={view === "month" ? "page" : undefined} className="admin-chip">
            Month
          </Link>
          <Link href={href(anchor, "week")} aria-current={view === "week" ? "page" : undefined} className="admin-chip">
            Week
          </Link>
        </div>
      </div>

      <div className="mt-4 hidden grid-cols-7 text-center text-xs text-white/45 sm:grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <ol className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-7">
        {days.map((d) => {
          const k = key(d);
          const evs = byDay.get(k) ?? [];
          const outside = view === "month" && !isSameMonth(d, anchor);
          // On phones, empty days are skipped so the list stays short.
          return (
            <li key={k} className={cn("bg-neutral-950 p-2", view === "month" ? "sm:min-h-28" : "sm:min-h-64", outside && "bg-neutral-950/60", evs.length === 0 && "hidden sm:block")}>
              <p className={cn("text-xs tabular-nums", outside ? "text-white/25" : "text-white/60", k === todayKey && "font-semibold text-sky-300")}>
                <span className="sm:hidden">{format(d, "EEE ")}</span>
                {format(d, view === "week" ? "EEE d" : "d")}
              </p>
              <ul className="mt-1 space-y-1">
                {evs.map((e) => (
                  <li key={`${e.batchId}-${e.kind}`}>
                    <Link
                      href={`/admin/batches/${e.batchId}`}
                      className={cn(
                        "block rounded-lg px-2 py-1.5 text-xs leading-tight transition-colors",
                        e.kind === "cutoff" ? "bg-sky-500/15 text-sky-200 hover:bg-sky-500/25" : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
                      )}
                    >
                      <span className="font-medium">{e.code}</span> {e.kind === "cutoff" ? "cutoff" : "pickup"}
                      <span className="block opacity-70">{format(new TZDate(e.at.getTime(), TZ), "h:mm a")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {events.length === 0 ? <p className="mt-4 text-sm text-white/50">No cutoffs or pickups in this {view}.</p> : null}
      <p className="mt-3 flex gap-4 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-400" aria-hidden /> cutoff
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-400" aria-hidden /> pickup
        </span>
      </p>
    </div>
  );
}
