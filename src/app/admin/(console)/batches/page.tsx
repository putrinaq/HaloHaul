import { AlertTriangle, Boxes, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MinProgress, ShortCountdown } from "@/components/admin/ShortCountdown";
import { Badge, EmptyState, PageHeader, Pagination } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { BATCH_MODE_LABELS } from "@/domain/labels";
import { fmtDate } from "@/lib/format";
import { listBatches, type BatchTab } from "@/server/admin/batches";
import { requireAdmin } from "@/server/session";
import { BatchFormButton, LockDueButton } from "./BatchControls";

export const metadata: Metadata = { title: "Batches" };

const TABS: Array<{ key: BatchTab; label: string }> = [
  { key: "air", label: "Air" },
  { key: "sea", label: "Sea" },
  { key: "history", label: "History" },
];

export default function BatchesPage({ searchParams }: PageProps<"/admin/batches">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Batches"
        actions={
          <>
            <LockDueButton />
            <BatchFormButton
              value={null}
              label={
                <>
                  <Plus className="size-4" aria-hidden />
                  New batch
                </>
              }
            />
          </>
        }
      />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function load(tab: BatchTab, page: number) {
  await requireAdmin();
  return { ...(await listBatches(getDb(), tab, page)), now: Date.now() };
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/batches">["searchParams"] }) {
  const sp = await searchParams;
  const tab: BatchTab = sp.tab === "sea" || sp.tab === "history" ? sp.tab : "air";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const { rows, pageCount, now } = await load(tab, page);

  return (
    <>
      <nav aria-label="Batch type" className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/batches?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className="admin-chip">
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={Boxes} title={tab === "history" ? "No finished batches yet" : "No batches here"} body={tab === "history" ? undefined : "Create the next batch so orders can join it."} />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/admin/batches/${b.id}`} className="admin-card block p-4 transition-colors hover:border-white/25">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-medium">{b.code}</p>
                    <p className="text-xs text-white/55">{BATCH_MODE_LABELS[b.mode]}</p>
                  </div>
                  <Badge tone={b.status === "open" ? "success" : b.status === "distributed" ? "neutral" : "info"}>{b.status}</Badge>
                </div>
                <p className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-white/55">Cutoff {fmtDate(b.cutoffAt, "d MMM, h:mm a")}</span>
                  {b.status === "open" ? <ShortCountdown target={b.cutoffAt} serverNow={now} className="text-xs" /> : null}
                </p>
                <div className="mt-3">
                  <MinProgress count={b.orderCount} min={b.minOrders} />
                </div>
                {b.belowMinAlertAt && (b.status === "open" || b.status === "locked") ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    Below minimum at cutoff — decide: extend or roll
                  </p>
                ) : null}
                {b.pickupStartsAt ? <p className="mt-2 text-xs text-white/45">Pickup {fmtDate(b.pickupStartsAt, "EEE d MMM, h:mm a")}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} href={(p) => `/admin/batches?tab=${tab}&page=${p}`} />
    </>
  );
}
