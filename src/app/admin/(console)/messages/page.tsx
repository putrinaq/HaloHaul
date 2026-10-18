import { MessagesSquare, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { EmptyState, PageHeader, Pagination } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { batches, customerProfiles, ledgerEntries, orders, users } from "@/db/schema";
import { TEMPLATE_KEYS, TEMPLATE_LABELS } from "@/domain/messages";
import { formatMyr } from "@/domain/money";
import { templateText } from "@/domain/settings";
import { fmtDate } from "@/lib/format";
import { getSettings } from "@/server/data/catalog";
import { requireAdmin } from "@/server/session";
import { Composer } from "./Composer";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Messages"
        subtitle="WhatsApp with a template, filled in for the order. Edit templates in Settings."
        actions={
          <Link href="/admin/settings/messages" className="admin-btn-secondary">
            Edit templates
          </Link>
        }
      />
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function load(q: string, page: number, pageSize = 25) {
  await requireAdmin();
  const db = getDb();
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const where = and(
    isNotNull(customerProfiles.phone),
    isNull(customerProfiles.anonymisedAt),
    q ? or(ilike(customerProfiles.displayName, like), ilike(users.email, like), ilike(customerProfiles.phone, like)) : undefined,
  );
  const [people, [{ n }], settings] = await Promise.all([
    db
      .select({ id: users.id, name: customerProfiles.displayName, phone: customerProfiles.phone })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(where)
      .orderBy(sql`(select max(o.created_at) from ${orders} o where o.customer_id = "users"."id") desc nulls last`)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(customerProfiles).innerJoin(users, eq(users.id, customerProfiles.userId)).where(where),
    getSettings(db),
  ]);
  const ids = people.map((p) => p.id);
  const recent = ids.length
    ? await db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          itemName: orders.itemName,
          status: orders.status,
          trackingNumber: orders.trackingNumber,
          owedSen: sql<number>`coalesce((select sum(l.amount_sen)::int from ${ledgerEntries} l where l.order_id = "orders"."id"), 0)`,
          pickupStartsAt: batches.pickupStartsAt,
          pickupEndsAt: batches.pickupEndsAt,
        })
        .from(orders)
        .leftJoin(batches, eq(batches.id, orders.batchId))
        .where(inArray(orders.customerId, ids))
        .orderBy(desc(orders.createdAt))
    : [];
  const templates = Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, templateText(settings, k)]));
  return {
    rows: people.map((p) => ({
      ...p,
      orders: recent
        .filter((o) => o.customerId === p.id)
        .slice(0, 5)
        .map((o) => ({
          id: o.id,
          label: `#${o.id} ${o.itemName}`,
          status: o.status,
          amount: formatMyr(Math.abs(o.owedSen)),
          tracking: o.trackingNumber ?? "",
          pickupWindow: o.pickupStartsAt ? `${fmtDate(o.pickupStartsAt, "EEE d MMM, h:mm a")}${o.pickupEndsAt ? `–${fmtDate(o.pickupEndsAt, "h:mm a")}` : ""}` : settings.pickup.windowText,
        })),
    })),
    pageCount: Math.max(1, Math.ceil(n / pageSize)),
    templates,
    labels: TEMPLATE_LABELS,
    pickupPoint: settings.pickup.pointName,
  };
}

async function List({ searchParams }: { searchParams: PageProps<"/admin/messages">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const data = await load(q, page);
  return (
    <div className="mt-6">
      <form action="/admin/messages" className="flex gap-2">
        <label htmlFor="mq" className="sr-only">
          Search
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" aria-hidden />
          <input id="mq" name="q" defaultValue={q} placeholder="Name, email or phone" className="admin-input pl-9" />
        </div>
        <button type="submit" className="admin-btn-secondary">
          Search
        </button>
      </form>
      {data.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={MessagesSquare} title="No customers with a WhatsApp number" body="Numbers come from the order form and the account page." />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.rows.map((p) => (
            <li key={p.id} className="admin-card p-4">
              <Composer person={{ id: p.id, name: p.name, phone: p.phone! }} orders={p.orders} templates={data.templates} labels={data.labels} pickupPoint={data.pickupPoint} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={data.pageCount} href={(n) => `/admin/messages?q=${encodeURIComponent(q)}&page=${n}`} />
    </div>
  );
}
