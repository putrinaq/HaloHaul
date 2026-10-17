import { CalendarClock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { PageHero } from "@/components/site/PageHero";
import { getDb } from "@/db/client";
import { BATCH_MODE_LABELS } from "@/domain/labels";
import { fmtDate } from "@/lib/format";
import { getSettings, getUpcomingBatches } from "@/server/data/catalog";
import { BatchList, type BatchRow } from "./BatchList";

export const metadata: Metadata = { title: "Shipping schedule" };

const DAY = 86_400_000;

export default function ShippingPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageHero
        eyebrow="Consolidated batches · air and sea"
        title="Shipping schedule"
        lede="Orders travel together in batches, and each shipping mode has its own cutoff."
      />

      <ScrollScope className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 sm:pb-28">
        <section data-scroll-defer className="glass-panel reveal p-5 sm:p-8">
          <h2 className="text-xl font-medium text-white">Upcoming batches</h2>
          <p className="mt-1 text-sm text-white/50">Times are Malaysia time.</p>
          <div className="mt-6">
            <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-white/5" />}>
              <Batches />
            </Suspense>
          </div>
          <p className="mt-6 flex gap-3 rounded-xl border border-white/8 bg-white/2 p-4 text-sm leading-relaxed text-white/60">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-white/70" aria-hidden />
            To join a batch, your item must reach the warehouse with all payments settled by the cutoff. Anything that
            misses it moves to the next batch automatically.
          </p>
        </section>

        <section data-scroll-defer className="glass-panel reveal p-5 sm:p-8">
          <h2 className="text-xl font-medium text-white">Typical transit</h2>
          <p className="mt-1 text-sm text-white/50">From cutoff to campus.</p>
          <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-xl bg-white/5" />}>
            <Transit />
          </Suspense>
        </section>

        <div data-scroll-defer className="reveal grid gap-3 sm:grid-cols-2">
          <Link href="/order/new" className="btn-primary">
            Start an order
          </Link>
          <Link href="/how-it-works" className="btn-secondary">
            How it works
          </Link>
        </div>
      </ScrollScope>
    </div>
  );
}

// Both panels need this; cache() makes it one query per request.
const loadSchedule = cache(async () => {
  await connection();
  const db = getDb();
  const now = Date.now();
  const [settings, batches] = await Promise.all([getSettings(db), getUpcomingBatches(db, new Date(now))]);
  return { settings, batches, now };
});

async function Batches() {
  const { batches, now } = await loadSchedule();
  // Formatted on the server (Malaysia time) so the client only renders strings.
  const rows: BatchRow[] = batches.map((b) => ({
    id: b.id,
    code: b.code,
    mode: b.mode,
    modeLabel: BATCH_MODE_LABELS[b.mode],
    cutoff: fmtDate(b.cutoffAt, "EEE d MMM, h:mm a"),
    daysLeft: Math.ceil((b.cutoffAt.getTime() - now) / DAY),
    pickup: b.pickupStartsAt
      ? `${fmtDate(b.pickupStartsAt, "d MMM, h:mm a")}${b.pickupEndsAt ? `–${fmtDate(b.pickupEndsAt, "h:mm a")}` : ""}`
      : null,
  }));
  return <BatchList rows={rows} />;
}

async function Transit() {
  const { settings } = await loadSchedule();
  const transit = settings.shipping.transitDays;
  const modes = ["air", "air_sensitive", "sea"] as const;
  const longest = Math.max(...modes.map((m) => transit[m].max));

  return (
    <>
      <dl className="mt-6 space-y-5">
        {modes.map((m) => {
          const { min, max } = transit[m];
          return (
            <div key={m}>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-white/80">{BATCH_MODE_LABELS[m]}</dt>
                <dd className="text-sm font-medium text-white tabular-nums">
                  {min}–{max} days
                </dd>
              </div>
              {/* Range bar: where this mode's window sits against the slowest one. */}
              <div aria-hidden className="relative mt-2 h-1.5 rounded-full bg-white/8">
                <span
                  className="absolute inset-y-0 rounded-full bg-linear-to-r from-sky-300 via-rose-400 to-orange-400"
                  style={{ left: `${(min / longest) * 100}%`, right: `${100 - (max / longest) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </dl>
      <p className="mt-6 flex gap-3 rounded-xl border border-white/8 bg-white/2 p-4 text-sm leading-relaxed text-white/60">
        <MapPin className="mt-0.5 size-4 shrink-0 text-white/70" aria-hidden />
        <span>
          Campus pickup: <span className="text-white/85">{settings.pickup.pointName}</span>. {settings.pickup.windowText}
        </span>
      </p>
    </>
  );
}
