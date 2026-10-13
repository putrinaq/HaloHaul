import { Plane, Ship } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { BATCH_MODE_LABELS } from "@/domain/labels";
import { fmtDate } from "@/lib/format";
import { getSettings, getUpcomingBatches } from "@/server/data/catalog";

export const metadata: Metadata = { title: "Shipping schedule" };

export default function ShippingPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <header>
        <h1 className="display text-5xl sm:text-6xl">Shipping schedule</h1>
        <p className="mt-3 text-muted-foreground">
          Orders travel together in consolidated batches. Each shipping mode has its own cutoff. To join a batch, your
          item must reach the warehouse with all payments settled by the cutoff; anything that misses it moves to the
          next batch automatically.
        </p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-card" />}>
        <Schedule />
      </Suspense>
    </div>
  );
}

async function loadSchedule() {
  await connection();
  const db = getDb();
  const [settings, batches] = await Promise.all([getSettings(db), getUpcomingBatches(db, new Date(Date.now()))]);
  return { settings, batches };
}

async function Schedule() {
  const { settings, batches } = await loadSchedule();
  const transit = settings.shipping.transitDays;

  return (
    <div className="space-y-8">
      {batches.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-muted-foreground">
          No batches are scheduled right now. Orders placed now join the first one.
        </p>
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
          {batches.map((b) => {
            const Icon = b.mode === "sea" ? Ship : Plane;
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4">
                <span className="flex min-w-40 items-center gap-2 font-medium">
                  <Icon className="size-4" aria-hidden /> {b.code}
                </span>
                <span className="text-sm">
                  Cutoff <strong>{fmtDate(b.cutoffAt, "EEE d MMM, h:mm a")}</strong>
                </span>
                {b.pickupStartsAt ? (
                  <span className="text-sm text-muted-foreground">
                    Pickup {fmtDate(b.pickupStartsAt, "d MMM, h:mm a")}
                    {b.pickupEndsAt ? `–${fmtDate(b.pickupEndsAt, "h:mm a")}` : ""}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <h2 className="display text-3xl">Typical transit</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {(["air", "air_sensitive", "sea"] as const).map((m) => (
            <div key={m} className="rounded-2xl bg-card p-4">
              <dt className="text-sm text-muted-foreground">{BATCH_MODE_LABELS[m]}</dt>
              <dd className="mt-1 text-lg">
                {transit[m].min}–{transit[m].max} days
              </dd>
              <dd className="text-xs text-muted-foreground">from cutoff to campus</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          Campus pickup: {settings.pickup.pointName}. {settings.pickup.windowText}
        </p>
      </section>
    </div>
  );
}
