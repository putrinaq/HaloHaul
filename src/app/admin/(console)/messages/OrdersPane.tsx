import { ExternalLink, Package } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/admin/ui";
import { ADMIN_STATUS_LABELS, PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Thread } from "@/server/whatsapp/inbox";

/** Who this is and what they've ordered, beside the chat. */
export function OrdersPane({ thread, photos }: { thread: Thread; photos: Record<string, { full: string; thumb: string }> }) {
  if (thread.customers.length === 0) {
    return (
      <p className="text-sm text-white/55">
        No HaloHaul account uses {thread.phone ? "this number" : "this WhatsApp"}, so there are no orders to show.
      </p>
    );
  }
  const several = thread.customers.length > 1;
  return (
    <div className="space-y-5 text-sm">
      {several ? (
        <p className="rounded-xl bg-warning/10 p-3 text-xs leading-relaxed text-warning">
          {thread.customers.length} accounts gave this number. Check who you&apos;re talking to before sharing order details.
        </p>
      ) : null}
      {thread.customers.map((c) => {
        const orders = thread.orders.filter((o) => o.customerId === c.id);
        return (
          <section key={c.id} className="space-y-3">
            <div>
              <Link href={`/admin/customer/${c.id}`} className="link-underline font-medium">
                {c.name}
              </Link>
              <p className="truncate text-xs text-white/50">{c.email}</p>
              <p className="text-xs text-white/50">
                {c.campus ?? "No campus"}
                <span className={cn("tabular-nums", c.balanceSen > 0 ? "text-warning" : c.balanceSen < 0 ? "text-success" : undefined)}>
                  {" · "}
                  {c.balanceSen > 0 ? `owes ${formatMyr(c.balanceSen)}` : c.balanceSen < 0 ? `${formatMyr(-c.balanceSen)} credit` : "settled"}
                </span>
              </p>
            </div>
            {orders.length === 0 ? <p className="text-white/50">No orders yet.</p> : null}
            <ul className="space-y-2">
              {orders.map((o) => {
                const photo = o.photoKeys[0] ? photos[o.photoKeys[0]] : undefined;
                const closed = ["completed", "cancelled", "rejected"].includes(o.status);
                return (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="group admin-card block p-3 transition-colors hover:border-white/25">
                      <span className="flex gap-3">
                        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5 text-white/35">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
                            <img src={photo.thumb} alt="" className="size-full object-cover" />
                          ) : (
                            <Package className="size-5" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-xs text-white/50 tabular-nums">
                            #{o.id}
                            <ExternalLink className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          </span>
                          <span className="block truncate font-medium">{o.itemName}</span>
                          {o.variantText ? <span className="block truncate text-xs text-white/50">{o.variantText}</span> : null}
                        </span>
                      </span>
                      <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge tone={o.status === "completed" ? "success" : closed ? "neutral" : "info"}>{ADMIN_STATUS_LABELS[o.status]}</Badge>
                        {o.owedSen > 0 ? <span className="text-xs text-warning tabular-nums">owes {formatMyr(o.owedSen)}</span> : null}
                        {o.owedSen <= 0 && o.quoteSen ? <span className="text-xs text-white/60 tabular-nums">up to {formatMyr(o.quoteSen)}</span> : null}
                      </span>
                      <span className="mt-1.5 block text-xs text-white/45">
                        {[o.platform ? PLATFORM_LABELS[o.platform] : null, o.shippingMode ? SHIPPING_MODE_LABELS[o.shippingMode] : null, o.batchCode, fmtDate(o.createdAt, "d MMM yyyy")].filter(Boolean).join(" · ")}
                      </span>
                      {o.trackingNumber ? <span className="mt-0.5 block truncate text-xs text-white/45">Tracking {o.trackingNumber}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
