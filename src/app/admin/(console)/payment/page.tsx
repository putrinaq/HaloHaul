import { CreditCard, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHeader, Pagination, Panel } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { ADMIN_STATUS_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ledgerSearch, pendingProofs, refundsDue } from "@/server/admin/payments";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { DrawerButton } from "../orders/[id]/OrderControls";

export const metadata: Metadata = { title: "Payment" };

const PURPOSE: Record<string, string> = { upfront_fee: "Upfront fee", order: "Order", balance: "Shipping balance" };
const LEDGER: Record<string, string> = {
  service_fee: "Coordination fee",
  item_payment: "Item",
  shipping_estimate: "Shipping estimate",
  shipping_adjustment: "Shipping adjustment",
  refund: "Credit",
  delivery_fee: "Delivery",
  consultation_fee: "Consultation fee",
  reverse_search_fee: "Photo search fee",
  payment: "Payment received",
  payout: "Refund sent",
};

export default function PaymentPage({ searchParams }: PageProps<"/admin/payment">) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader title="Payment" subtitle="DuitNow proofs to confirm, refunds to issue, and the ledger." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function load(sp: Awaited<PageProps<"/admin/payment">["searchParams"]>) {
  await requireAdmin();
  const db = getDb();
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const lpage = Math.max(1, Number.parseInt(String(sp.lpage ?? "1"), 10) || 1);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const [proofs, refunds, ledger] = await Promise.all([pendingProofs(db, page), refundsDue(db), ledgerSearch(db, q, lpage)]);
  const urls = await imageUrlMap(getPhotoStore(), proofs.rows.flatMap((p) => (p.proofPhotoKey ? [p.proofPhotoKey] : [])));
  return { proofs, refunds, ledger, urls, page, lpage, q };
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/payment">["searchParams"] }) {
  const { proofs, refunds, ledger, urls, page, lpage, q } = await load(await searchParams);
  return (
    <>
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium">
          Proofs waiting <span className="text-sm text-white/45 tabular-nums">{proofs.total}</span>
        </h2>
        {proofs.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="No proofs waiting" body="Proofs students upload show up here, oldest first." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {proofs.rows.map((p) => {
              const mismatch = p.purpose !== "upfront_fee" && p.owedSen > 0 && p.amountSen !== p.owedSen;
              const img = p.proofPhotoKey ? urls[p.proofPhotoKey] : undefined;
              return (
                <li key={p.id} className="admin-card flex gap-3 p-4 text-sm">
                  {img ? (
                    <a href={img.full} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL */}
                      <img src={img.thumb} alt="Payment proof" className="size-20 rounded-xl object-cover" />
                    </a>
                  ) : (
                    <span className="size-20 shrink-0 rounded-xl bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <Link href={`/admin/orders/${p.orderId}`} className="link-underline">
                        #{p.orderId}
                      </Link>{" "}
                      {p.customerName}
                    </p>
                    <p className="truncate text-white/55">{p.itemName}</p>
                    <p className="mt-1 tabular-nums">
                      {formatMyr(p.amountSen)} <span className="text-white/45">claimed · {PURPOSE[p.purpose]}</span>
                    </p>
                    <p className={cn("text-xs tabular-nums", mismatch ? "text-warning" : "text-white/45")}>Owed {formatMyr(Math.max(0, p.owedSen))}</p>
                    <div className="mt-2">
                      <DrawerButton drawer="payment" orderId={p.orderId} className="admin-btn-primary h-9 w-full sm:h-9">
                        Review
                      </DrawerButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageCount={proofs.pageCount} href={(n) => `/admin/payment?page=${n}`} />
      </section>

      {refunds.length ? (
        <Panel title={`Refunds and credits due · ${refunds.length}`}>
          <ul className="divide-y divide-white/10">
            {refunds.map((r) => (
              <li key={r.orderId} className="flex flex-wrap items-center gap-3 py-2.5">
                <Link href={`/admin/orders/${r.orderId}`} className="min-w-0 flex-1">
                  <span className="block truncate">
                    #{r.orderId} {r.itemName}
                  </span>
                  <span className="text-xs text-white/50">
                    {r.customerName} · {ADMIN_STATUS_LABELS[r.status]}
                  </span>
                </Link>
                <span className="text-success tabular-nums">{formatMyr(Math.max(0, r.creditSen))}</span>
                <DrawerButton drawer="refund" orderId={r.orderId} className="admin-btn-secondary h-9 sm:h-9">
                  Issue
                </DrawerButton>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-medium">Ledger</h2>
        <form action="/admin/payment" className="flex gap-2">
          <label htmlFor="ledger-q" className="sr-only">
            Order number or customer
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" aria-hidden />
            <input id="ledger-q" name="q" defaultValue={q} placeholder="Order number, or customer name or email" className="admin-input pl-9" />
          </div>
          <button type="submit" className="admin-btn-secondary">
            Search
          </button>
        </form>
        {q ? (
          <p className="mt-3 text-sm text-white/60">
            {ledger.total} entr{ledger.total === 1 ? "y" : "ies"} · balance{" "}
            <strong className={cn("tabular-nums", ledger.balanceSen < 0 ? "text-success" : ledger.balanceSen > 0 ? "text-warning" : undefined)}>
              {ledger.balanceSen < 0 ? `${formatMyr(-ledger.balanceSen)} credit` : `${formatMyr(ledger.balanceSen)} owed`}
            </strong>
          </p>
        ) : null}
        <div className="admin-card mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-white/50">
              <tr>
                <th className="px-4 py-3 font-normal">When</th>
                <th className="px-4 py-3 font-normal">Order</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 font-normal">Entry</th>
                <th className="px-4 py-3 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((l) => (
                <tr key={l.id} className="border-t border-white/10">
                  <td className="px-4 py-2.5 text-white/55">{fmtDate(l.createdAt, "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5">{l.orderId ? <Link href={`/admin/orders/${l.orderId}`} className="link-underline">#{l.orderId}</Link> : "—"}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/customer/${l.customerId}`} className="link-underline">
                      {l.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {LEDGER[l.type] ?? l.type}
                    {l.reference ? <span className="block max-w-56 truncate text-xs text-white/40" title={l.reference}>{l.reference}</span> : null}
                  </td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", l.amountSen < 0 && "text-success")}>{l.amountSen < 0 ? `−${formatMyr(-l.amountSen)}` : formatMyr(l.amountSen)}</td>
                </tr>
              ))}
              {ledger.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-white/50">
                    No ledger entries{q ? " match" : " yet"}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination page={lpage} pageCount={ledger.pageCount} href={(n) => `/admin/payment?q=${encodeURIComponent(q)}&lpage=${n}`} />
      </section>
    </>
  );
}
