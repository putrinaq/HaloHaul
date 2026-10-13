import { ChevronRight, Plane, Ship } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { BATCH_MODE_LABELS } from "@/domain/labels";
import { fmtDate } from "@/lib/format";
import { getNextBatchPerMode, getSettings } from "@/server/data/catalog";
import { Countdown } from "./Countdown";

async function loadCutoffs() {
  await connection();
  const now = Date.now();
  const db = getDb();
  const [next, settings] = await Promise.all([getNextBatchPerMode(db, new Date(now)), getSettings(db)]);
  const cards = (["air", "sea", "air_sensitive"] as const).map((mode) => next[mode]).filter((b) => b !== undefined);
  return { now, cards, cadence: settings.shipping.cadenceText };
}

/** Live cutoff countdowns, read from the batches table at request time. */
export async function Cutoffs() {
  const { now, cards, cadence } = await loadCutoffs();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-muted-foreground sm:col-span-2">
          The next batches haven&apos;t been scheduled yet. Orders placed now join the first one.
        </p>
      ) : (
        cards.slice(0, 2).map((b) => {
          const Icon = b.mode === "sea" ? Ship : Plane;
          return (
            <article key={b.id} className="rounded-2xl bg-card p-6">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4" aria-hidden /> {BATCH_MODE_LABELS[b.mode]}
              </p>
              <p className="mt-3 text-lg">{b.code}</p>
              <p className="mt-4 text-xs text-muted-foreground">Next cutoff</p>
              <p className="text-xl">{fmtDate(b.cutoffAt)}</p>
              <div className="mt-2">
                <Countdown target={b.cutoffAt.toISOString()} serverNow={now} />
              </div>
              <p className="mt-1 text-right text-xs text-muted-foreground">{cadence[b.mode]}</p>
            </article>
          );
        })
      )}
    </div>
  );
}

export function CutoffsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl bg-card" />
      ))}
    </div>
  );
}

export function CutoffsSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 className="display text-4xl sm:text-5xl">Next Shipment Cutoff</h2>
        <Link href="/shipping" className="flex shrink-0 items-center gap-1 text-sm hover:underline">
          Full Schedule <ChevronRight className="size-4" />
        </Link>
      </div>
      {children}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Orders must reach the warehouse with all payments settled by the cutoff date to join that cycle. Anything that
        misses it moves to the next batch automatically.
      </p>
    </section>
  );
}
