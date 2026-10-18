import { Download } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { ADMIN_PATH_LABELS, ADMIN_STATUS_LABELS, PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import type { OrderStatus, PathType, Platform, ShippingMode } from "@/domain/enums";
import { cn } from "@/lib/utils";
import { moneyByBatch, moneyByMonth, ordersBy, speedPriceReport, statusTimeReport } from "@/server/admin/report";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Report" };

export default function ReportPage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="Report" subtitle="The last 12 months. Money comes straight from the ledger." />
      <Suspense fallback={<div className="mt-6 h-128 animate-pulse rounded-2xl bg-white/5" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function load() {
  await requireAdmin();
  const db = getDb();
  const [months, byBatch, byCategory, byPath, byPlatform, speed, times] = await Promise.all([
    moneyByMonth(db),
    moneyByBatch(db),
    ordersBy(db, "category"),
    ordersBy(db, "path"),
    ordersBy(db, "platform"),
    speedPriceReport(db),
    statusTimeReport(db),
  ]);
  return { months, byBatch, byCategory, byPath, byPlatform, speed, times };
}

function Section({ title, csv, children, note }: { title: string; csv: string; children: ReactNode; note?: string }) {
  return (
    <section className="admin-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <a href={`/admin/report/export/${csv}`} download className="admin-btn-secondary h-9 sm:h-9">
          <Download className="size-4" aria-hidden />
          CSV
        </a>
      </div>
      {note ? <p className="mb-3 text-xs text-white/45">{note}</p> : null}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Table({ head, rows, align, compact }: { head: string[]; rows: ReactNode[][]; align?: ("l" | "r")[]; compact?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-white/50">No data yet.</p>;
  return (
    <table className={cn("w-full text-sm", !compact && "min-w-[32rem]")}>
      <thead className="text-white/50">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={cn("pb-2 font-normal", (align?.[i] ?? (i === 0 ? "l" : "r")) === "r" ? "text-right" : "text-left")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-white/10">
            {r.map((c, j) => (
              <td key={j} className={cn("py-2 tabular-nums", (align?.[j] ?? (j === 0 ? "l" : "r")) === "r" ? "text-right" : "text-left")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const m = (sen: number | null) => (sen === null ? "—" : formatMyr(sen));
const label = (dim: "category" | "path" | "platform", key: string) =>
  dim === "path" ? ADMIN_PATH_LABELS[key as PathType] : dim === "platform" ? PLATFORM_LABELS[key as Platform] : key;

async function Content() {
  const d = await load();
  return (
    <div className="mt-6 space-y-4">
      <Section title="Revenue and fees by month" csv="months" note="Fees = coordination + photo search + consultation, net of credits back.">
        <Table
          head={["Month", "Fees", "Items", "Shipping", "Delivery", "Credits", "Received", "Refunded"]}
          rows={d.months.map((r) => [r.key, m(r.feesSen), m(r.itemsSen), m(r.shippingSen), m(r.deliverySen), m(r.creditsSen), m(r.receivedSen), m(r.paidOutSen)])}
        />
      </Section>

      <Section title="Revenue and fees by batch" csv="batches" note="Shipping margin = shipping charged to students minus the forwarder's bill (after the weigh-in).">
        <Table
          head={["Batch", "Orders", "Fees", "Shipping charged", "Forwarder bill", "Shipping margin"]}
          rows={d.byBatch.map((r) => [
            r.key,
            r.orderCount,
            m(r.feesSen),
            m(r.shippingSen),
            m(r.costSen),
            <span key="mg" className={cn(r.shippingMarginSen !== null && r.shippingMarginSen < 0 && "text-destructive")}>
              {m(r.shippingMarginSen)}
            </span>,
          ])}
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        {(
          [
            ["category", "Orders by category", d.byCategory],
            ["path", "Orders by path", d.byPath],
            ["platform", "Orders by platform", d.byPlatform],
          ] as const
        ).map(([dim, title, rows]) => (
          <Section key={dim} title={title} csv={`orders-by-${dim}`}>
            <Table compact head={["", "Orders", "Done", "Cancelled"]} rows={rows.map((r) => [label(dim, r.key), r.total, r.completed, r.cancelled])} />
          </Section>
        ))}
      </div>

      <Section title="Speed vs price" csv="speed-vs-price" note="What students chose against the options shown when they ordered (orders with a real choice only).">
        <Table
          head={["Chose", "Orders", "Picked the cheapest", "Picked the fastest", "Avg extra paid", "Avg days saved"]}
          rows={d.speed.map((r) => [
            SHIPPING_MODE_LABELS[r.mode as ShippingMode] ?? r.mode,
            r.orders,
            `${Math.round((r.choseCheapest / r.orders) * 100)}%`,
            `${Math.round((r.choseFastest / r.orders) * 100)}%`,
            m(r.avgExtraSen),
            r.avgDaysSaved === null ? "—" : `${r.avgDaysSaved} days`,
          ])}
        />
      </Section>

      <Section title="Average time in each status" csv="time-in-status" note="Longest first — that's where orders wait. Only finished stays count.">
        <Table
          head={["Status", "Average", "Median", "Orders"]}
          rows={d.times.map((r) => [ADMIN_STATUS_LABELS[r.status as OrderStatus], hours(r.avgHours), hours(r.medianHours), r.samples])}
        />
      </Section>
    </div>
  );
}

function hours(h: number) {
  return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)} h`;
}
