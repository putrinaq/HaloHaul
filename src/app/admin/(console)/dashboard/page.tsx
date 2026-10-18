import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MinProgress, ShortCountdown } from "@/components/admin/ShortCountdown";
import { PageHeader, Panel, StatTile } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { waiting } from "@/domain/adminQueue";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dashboard } from "@/server/admin/dashboard";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Dashboard" />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function load() {
  await requireAdmin();
  const now = Date.now();
  return { d: await dashboard(getDb(), new Date(now)), now };
}

async function Content() {
  const { d, now } = await load();
  const cutoff = (label: string, b: typeof d.air) => (
    <div className="admin-card p-4">
      <p className="text-sm text-white/55">Next {label} cutoff</p>
      {b ? (
        <Link href={`/admin/batches/${b.id}`} className="mt-1 block">
          <p className="text-xl font-medium">{b.code}</p>
          <p className="text-sm">
            {fmtDate(b.cutoffAt, "EEE d MMM, h:mm a")} · <ShortCountdown target={b.cutoffAt} serverNow={now} />
          </p>
          <div className="mt-3">
            <MinProgress count={b.orderCount} min={b.minOrders} />
          </div>
        </Link>
      ) : (
        <p className="mt-1 text-sm text-white/50">
          None open. <Link href="/admin/batches" className="text-sky-300 hover:underline">Create one</Link>
        </p>
      )}
    </div>
  );

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Need action" value={d.needAction} href="/admin" tone={d.needAction ? "warning" : undefined} />
        <StatTile label="Open orders" value={d.openOrders} />
        <StatTile label="Unconfirmed payments" value={d.pendingPayments} href="/admin/payment" tone={d.pendingPayments ? "warning" : undefined} />
        <StatTile label="Revenue this month" value={formatMyr(d.feesSen)} hint={`Fees earned · ${formatMyr(d.moneyInSen)} received in total`} href="/admin/report" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cutoff("air", d.air)}
        {cutoff("sea", d.sea)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Waiting longest" actions={<Link href="/admin" className="text-sm text-sky-300 hover:underline">All</Link>}>
          {d.oldest.length === 0 ? (
            <p className="text-white/50">All caught up.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {d.oldest.map((o) => {
                const w = waiting(o.waitingSince, new Date(now));
                return (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          #{o.id} {o.itemName}
                        </span>
                        <span className="text-xs text-white/45">
                          {o.customerName} · next: {o.action.label}
                        </span>
                      </span>
                      <span className={cn("text-xs tabular-nums", ["text-white/55", "text-warning", "text-destructive"][w.level])}>{w.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="This week's pickups">
          <p className="text-2xl font-medium tabular-nums">{d.readyForPickup}</p>
          <p className="text-white/55">orders ready for pickup</p>
          {d.pickups.length ? (
            <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
              {d.pickups.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/batches/${p.id}`} className="flex justify-between gap-3 hover:text-white">
                    <span>{p.code}</span>
                    <span className="text-white/55">
                      {fmtDate(p.pickupStartsAt!, "EEE d MMM, h:mm a")}
                      {p.pickupEndsAt ? `–${fmtDate(p.pickupEndsAt, "h:mm a")}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-white/45">No pickup windows set this week.</p>
          )}
        </Panel>
      </div>

      <Panel title="Recent activity">
        {d.activity.length === 0 ? (
          <p className="text-white/50">Nothing yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {d.activity.map((a, i) => (
              <li key={i} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <span className="w-36 shrink-0 text-xs text-white/45 tabular-nums">{fmtDate(a.at, "d MMM, h:mm a")}</span>
                <Link href={a.href} className="min-w-0 flex-1 hover:underline">
                  {a.text}
                </Link>
                <span className="text-xs text-white/45">{a.by}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
