import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/order/StatusBadge";
import { getDb } from "@/db/client";
import { PATH_LABELS, PLATFORM_LABELS } from "@/domain/labels";
import { fmtDateShort, orderNo } from "@/lib/format";
import { listOrdersForCustomer } from "@/server/data/orders";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "My orders" };

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="display text-5xl">My orders</h1>
        <Link href="/order/new" className="text-sm underline underline-offset-4">
          New order
        </Link>
      </div>
      <Suspense fallback={<div className="mt-8 h-48 animate-pulse rounded-2xl bg-card" />}>
        <OrderList />
      </Suspense>
    </div>
  );
}

async function OrderList() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/orders");
  const orders = await listOrdersForCustomer(getDb(), user.id);

  if (orders.length === 0) {
    return (
      <div className="mt-8 rounded-2xl bg-card p-8 text-center">
        <p>No orders yet.</p>
        <Link href="/order/new" className="mt-3 inline-block underline underline-offset-4">
          Start your first order
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-white/5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <span className="text-muted-foreground">{orderNo(o.id)}</span> {o.itemName}
              </p>
              <p className="text-xs text-muted-foreground">
                {PATH_LABELS[o.pathType]} · {PLATFORM_LABELS[o.platform]} · {fmtDateShort(o.createdAt)}
              </p>
            </div>
            <StatusBadge status={o.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
