import { ArrowLeft, CircleCheck, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MinProgress, ShortCountdown } from "@/components/admin/ShortCountdown";
import { Badge, Panel, Rows } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { ADMIN_STATUS_LABELS, BATCH_MODE_LABELS } from "@/domain/labels";
import { formatCny } from "@/domain/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BATCH_FLOW, getBatch } from "@/server/admin/batches";
import { getSettings } from "@/server/data/catalog";
import { requireAdmin } from "@/server/session";
import { AddOrdersButton, BatchActions, BatchFormButton, RemoveOrderButton, SummaryButton, WeighInButton } from "../BatchControls";

export const metadata: Metadata = { title: "Batch" };

export default function BatchPage({ params }: PageProps<"/admin/batches/[id]">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/admin/batches" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Batches
      </Link>
      <Suspense fallback={<div className="mt-4 h-128 animate-pulse rounded-2xl bg-white/5" />}>
        <Batch params={params} />
      </Suspense>
    </div>
  );
}

async function load(id: string) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = getDb();
  const [data, settings] = await Promise.all([getBatch(db, id), getSettings(db)]);
  return data ? { ...data, settings, now: Date.now() } : null;
}

async function Batch({ params }: { params: PageProps<"/admin/batches/[id]">["params"] }) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { batch: b, customers, items, candidates, settings, now } = data;
  const live = items.filter((i) => !["cancelled", "rejected"].includes(i.status));
  const editable = b.status === "open" || b.status === "locked";

  return (
    <div className="mt-2 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl sm:text-6xl">{b.code}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/55">
            {BATCH_MODE_LABELS[b.mode]} · {b.forwarder ?? "default forwarder"}
            <Badge tone={b.status === "open" ? "success" : "info"}>{b.status}</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryButton batchId={b.id} />
          <WeighInButton batchId={b.id} defaultRate={settings.fx.defaultMyrPerCny} weighed={b.weighedAt !== null} />
          <BatchFormButton
            className="admin-btn-secondary"
            label="Edit"
            value={{
              id: b.id,
              code: b.code,
              mode: b.mode,
              cutoffAt: b.cutoffAt.toISOString(),
              minOrders: b.minOrders,
              pickupStartsAt: b.pickupStartsAt?.toISOString() ?? null,
              pickupEndsAt: b.pickupEndsAt?.toISOString() ?? null,
              forwarder: b.forwarder,
              notes: b.notes,
            }}
          />
        </div>
      </header>

      <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label="Batch progress">
        {BATCH_FLOW.map((s, i) => {
          const done = BATCH_FLOW.indexOf(b.status) >= i;
          return (
            <li key={s} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1", done ? "border-sky-400/50 text-sky-200" : "border-white/10 text-white/40")}>
              {done ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleDashed className="size-3.5" aria-hidden />}
              {s}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">
              {customers.length} customer{customers.length === 1 ? "" : "s"} · {live.length} order{live.length === 1 ? "" : "s"}
            </h2>
            {editable ? <AddOrdersButton batchId={b.id} candidates={candidates} /> : null}
          </div>
          {customers.length === 0 ? <p className="admin-card p-6 text-sm text-white/55">No orders yet. Orders join from the Actions board (&quot;Add to batch&quot;) or with Add orders.</p> : null}
          {customers.map((c) => (
            <article key={c.id} className="admin-card p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <Link href={`/admin/customer/${c.id}`} className="font-medium link-underline">
                  {c.name}
                </Link>
                <span className="text-xs text-white/45">{c.phone ?? ""}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-2.5">
                    <span className={cn("size-2 shrink-0 rounded-full", o.ready ? "bg-success" : "bg-warning")} aria-hidden />
                    <Link href={`/admin/orders/${o.id}`} className="min-w-0 flex-1">
                      <span className="block truncate">
                        #{o.id} {o.itemName}
                      </span>
                      <span className="block text-xs text-white/50">
                        {ADMIN_STATUS_LABELS[o.status]}
                        {o.action ? ` · next: ${o.action}` : ""}
                        {o.finalWeightG ? ` · ${(o.finalWeightG / 1000).toFixed(2)} kg` : o.estWeightG ? ` · ~${(o.estWeightG / 1000).toFixed(2)} kg` : ""}
                      </span>
                    </Link>
                    <Badge tone={o.ready ? "success" : "warning"}>{o.ready ? "ready" : "needs action"}</Badge>
                    {editable ? <RemoveOrderButton batchId={b.id} orderId={o.id} /> : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <aside className="space-y-4">
          <Panel title="Cutoff">
            <p className="text-lg">{fmtDate(b.cutoffAt, "EEE d MMM, h:mm a")}</p>
            {b.status === "open" ? <ShortCountdown target={b.cutoffAt} serverNow={now} /> : null}
            <div className="mt-4">
              <MinProgress count={live.length} min={b.minOrders} />
            </div>
          </Panel>
          <Panel title="Next step">
            <BatchActions id={b.id} status={b.status} belowMin={b.belowMinAlertAt !== null} />
          </Panel>
          <Panel title="Details">
            <Rows
              rows={[
                ["Pickup", b.pickupStartsAt ? `${fmtDate(b.pickupStartsAt, "EEE d MMM, h:mm a")}${b.pickupEndsAt ? ` – ${fmtDate(b.pickupEndsAt, "h:mm a")}` : ""}` : "Not set"],
                ["Locked", b.lockedAt ? fmtDateTime(b.lockedAt) : "—"],
                ["Weighed", b.weighedAt ? `${((b.actualWeightG ?? 0) / 1000).toFixed(2)} kg · ${b.actualCostFen !== null ? formatCny(b.actualCostFen) : ""}` : "—"],
                b.notes ? ["Notes", <span key="n" className="whitespace-pre-line">{b.notes}</span>] : null,
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
