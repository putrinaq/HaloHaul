import { ChevronRight, PackageOpen, Plus } from "lucide-react";
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
        <Link href="/order/new" className="btn-secondary px-4">
          <Plus className="size-4" aria-hidden />
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
      <div className="mt-8 flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center">
        <span className="icon-chip size-12">
          <PackageOpen className="size-5" aria-hidden />
        </span>
        <p className="mt-4 font-medium">No orders yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Send us a link, a photo or a description and we&apos;ll come back with a full quote.
        </p>
        <Link href="/order/new" className="btn-primary mt-6 w-full sm:w-auto">
          Start your first order
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={`/orders/${o.id}`}
            className="flex items-center gap-3 p-4 transition-colors hover:bg-white/5 active:bg-white/10 sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <span className="text-muted-foreground">{orderNo(o.id)}</span> {o.itemName}
              </p>
              <p className="text-xs text-muted-foreground">
                {PATH_LABELS[o.pathType]} · {PLATFORM_LABELS[o.platform]} · {fmtDateShort(o.createdAt)}
              </p>
            </div>
            <StatusBadge status={o.status} />
            <ChevronRight className="size-4 shrink-0 text-white/30" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
