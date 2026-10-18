import { getDb } from "@/db/client";
import { ADMIN_PATH_LABELS, ADMIN_STATUS_LABELS, PLATFORM_LABELS } from "@/domain/labels";
import type { OrderStatus, PathType, Platform } from "@/domain/enums";
import { toCsv } from "@/domain/report";
import { moneyByBatch, moneyByMonth, ordersBy, speedPriceReport, statusTimeReport } from "@/server/admin/report";
import { adminUserId } from "@/server/apiAuth";

// CSV export for each Report section. Admin-only (checked here, not only on the page).

const rm = (sen: number | null) => (sen === null ? "" : (sen / 100).toFixed(2));

const REPORTS: Record<string, () => Promise<{ header: string[]; rows: Array<Array<string | number | null>> }>> = {
  months: async () => ({
    header: ["month", "fees_rm", "items_rm", "shipping_rm", "delivery_rm", "credits_rm", "received_rm", "refunded_rm"],
    rows: (await moneyByMonth(getDb())).map((r) => [r.key, rm(r.feesSen), rm(r.itemsSen), rm(r.shippingSen), rm(r.deliverySen), rm(r.creditsSen), rm(r.receivedSen), rm(r.paidOutSen)]),
  }),
  batches: async () => ({
    header: ["batch", "orders", "fees_rm", "shipping_charged_rm", "forwarder_bill_rm", "shipping_margin_rm", "weight_kg"],
    rows: (await moneyByBatch(getDb())).map((r) => [r.key, r.orderCount, rm(r.feesSen), rm(r.shippingSen), rm(r.costSen), rm(r.shippingMarginSen), r.weightG === null ? "" : (r.weightG / 1000).toFixed(2)]),
  }),
  "orders-by-category": async () => ({ header: ["category", "orders", "completed", "cancelled"], rows: (await ordersBy(getDb(), "category")).map((r) => [r.key, r.total, r.completed, r.cancelled]) }),
  "orders-by-path": async () => ({
    header: ["path", "orders", "completed", "cancelled"],
    rows: (await ordersBy(getDb(), "path")).map((r) => [ADMIN_PATH_LABELS[r.key as PathType] ?? r.key, r.total, r.completed, r.cancelled]),
  }),
  "orders-by-platform": async () => ({
    header: ["platform", "orders", "completed", "cancelled"],
    rows: (await ordersBy(getDb(), "platform")).map((r) => [PLATFORM_LABELS[r.key as Platform] ?? r.key, r.total, r.completed, r.cancelled]),
  }),
  "speed-vs-price": async () => ({
    header: ["chosen_mode", "orders", "chose_cheapest", "chose_fastest", "avg_extra_paid_rm", "avg_days_saved"],
    rows: (await speedPriceReport(getDb())).map((r) => [r.mode, r.orders, r.choseCheapest, r.choseFastest, rm(r.avgExtraSen), r.avgDaysSaved]),
  }),
  "time-in-status": async () => ({
    header: ["status", "avg_hours", "median_hours", "orders"],
    rows: (await statusTimeReport(getDb())).map((r) => [ADMIN_STATUS_LABELS[r.status as OrderStatus], r.avgHours, r.medianHours, r.samples]),
  }),
};

export async function GET(req: Request, { params }: RouteContext<"/admin/report/export/[report]">) {
  if (!(await adminUserId(req))) return new Response("Not found", { status: 404 });
  const { report } = await params;
  const build = REPORTS[report];
  if (!build) return new Response("Not found", { status: 404 });
  const { header, rows } = await build();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(header, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="halohaul-${report}-${date}.csv"`,
      "cache-control": "no-store",
    },
  });
}
