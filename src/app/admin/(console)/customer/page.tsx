import { ChevronRight, Search, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, EmptyState, PageHeader, Pagination } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listCustomers } from "@/server/admin/customers";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage({ searchParams }: PageProps<"/admin/customer">) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Customers" />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/customer">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const { rows, total, pageCount } = await listCustomers(getDb(), q, page);
  return (
    <div className="mt-6">
      <form action="/admin/customer" className="flex gap-2">
        <label htmlFor="cq" className="sr-only">
          Search customers
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" aria-hidden />
          <input id="cq" name="q" defaultValue={q} placeholder="Name, email or phone" className="admin-input pl-9" />
        </div>
        <button type="submit" className="admin-btn-secondary">
          Search
        </button>
      </form>
      <p className="mt-3 text-sm text-white/50">
        {total} customer{total === 1 ? "" : "s"}
      </p>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={UserRound} title={q ? "No one matches" : "No customers yet"} />
        </div>
      ) : (
        <ul className="admin-card mt-3 divide-y divide-white/10 text-sm">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/customer/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-white/5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-medium">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {c.name}
                    {c.anonymisedAt ? <Badge>anonymised</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-white/50">
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <span className="block tabular-nums">
                    {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                  </span>
                  <span className="block text-xs text-white/45">{c.lastOrderAt ? `last ${fmtDate(c.lastOrderAt, "d MMM yyyy")}` : "no orders"}</span>
                </span>
                <span className={cn("w-24 text-right text-xs tabular-nums", c.balanceSen > 0 ? "text-warning" : c.balanceSen < 0 ? "text-success" : "text-white/40")}>
                  {c.balanceSen > 0 ? `owes ${formatMyr(c.balanceSen)}` : c.balanceSen < 0 ? `credit ${formatMyr(-c.balanceSen)}` : "settled"}
                </span>
                <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} href={(p) => `/admin/customer?q=${encodeURIComponent(q)}&page=${p}`} />
    </div>
  );
}
