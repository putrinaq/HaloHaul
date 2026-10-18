import { ArrowLeft, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Panel, Rows } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { MEASUREMENT_GROUP_LABELS } from "@/domain/categorySchema";
import { ADMIN_PATH_LABELS, ADMIN_STATUS_LABELS } from "@/domain/labels";
import { waLink } from "@/domain/messages";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCustomer } from "@/server/admin/customers";
import { requireAdmin } from "@/server/session";
import { AnonymiseButton, MeasurementsButton, NotesEditor } from "./CustomerControls";

export const metadata: Metadata = { title: "Customer" };

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

export default function CustomerPage({ params }: PageProps<"/admin/customer/[id]">) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link href="/admin/customer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Customers
      </Link>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <Customer params={params} />
      </Suspense>
    </div>
  );
}

async function Customer({ params }: { params: PageProps<"/admin/customer/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  const c = await getCustomer(getDb(), id);
  if (!c) notFound();
  const anonymised = !!c.profile?.anonymisedAt;
  const saved = c.profile?.savedMeasurements ?? {};
  const savedRows = c.library.filter((m) => saved[m.key] !== undefined);

  return (
    <div className="mt-2 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl">{c.user.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55">
            Customer since {fmtDate(c.user.createdAt, "MMM yyyy")}
            {anonymised ? <Badge>anonymised</Badge> : null}
            <span className={cn("tabular-nums", c.balance.owedSen ? "text-warning" : c.balance.creditSen ? "text-success" : undefined)}>
              · {c.balance.owedSen ? `owes ${formatMyr(c.balance.owedSen)}` : c.balance.creditSen ? `${formatMyr(c.balance.creditSen)} credit` : "settled"}
            </span>
          </p>
        </div>
        {!anonymised ? <AnonymiseButton id={c.user.id} name={c.user.name} /> : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Panel title={`Orders · ${c.orders.length}`}>
            {c.orders.length === 0 ? (
              <p className="text-white/50">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.id}`} className="flex items-center gap-3 py-2.5 hover:text-white">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          #{o.id} {o.itemName}
                        </span>
                        <span className="text-xs text-white/45">
                          {ADMIN_PATH_LABELS[o.pathType]} · {fmtDate(o.createdAt, "d MMM yyyy")}
                        </span>
                      </span>
                      <Badge tone={o.status === "completed" ? "success" : ["cancelled", "rejected"].includes(o.status) ? "neutral" : "info"}>{ADMIN_STATUS_LABELS[o.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Ledger">
            {c.ledger.length === 0 ? (
              <p className="text-white/50">No entries.</p>
            ) : (
              <ul className="space-y-1.5">
                {c.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="min-w-0 text-white/70">
                      {LEDGER[l.type] ?? l.type}
                      {l.orderId ? (
                        <Link href={`/admin/orders/${l.orderId}`} className="ml-1 text-white/45 hover:underline">
                          #{l.orderId}
                        </Link>
                      ) : null}
                      <span className="block text-xs text-white/40">{fmtDate(l.createdAt, "d MMM yyyy")}</span>
                    </span>
                    <span className={cn("tabular-nums", l.amountSen < 0 && "text-success")}>{l.amountSen < 0 ? `−${formatMyr(-l.amountSen)}` : formatMyr(l.amountSen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="Profile">
            <Rows
              rows={[
                ["Email", c.user.email],
                ["Phone", c.profile?.phone ?? "—"],
                ["Campus", c.profile?.campus ?? "—"],
              ]}
            />
            {!anonymised ? (
              <div className="mt-3 flex flex-col gap-2">
                {c.profile?.phone ? (
                  <a href={waLink(c.profile.phone, `Hi ${c.user.name.split(/\s+/)[0]}, this is HaloHaul.`)} target="_blank" rel="noopener noreferrer" className="admin-btn-secondary justify-start">
                    <MessageCircle className="size-4" aria-hidden />
                    WhatsApp
                  </a>
                ) : null}
                <a href={`mailto:${c.user.email}`} className="admin-btn-secondary justify-start">
                  <Mail className="size-4" aria-hidden />
                  Email
                </a>
              </div>
            ) : null}
          </Panel>
          <Panel title="Saved measurements" actions={!anonymised && c.profile ? <MeasurementsButton id={c.user.id} saved={saved} library={c.library} /> : null}>
            {savedRows.length === 0 ? (
              <p className="text-white/50">None saved.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                {savedRows.map((m) => (
                  <div key={m.key}>
                    <dt className="text-xs text-white/45">
                      {m.label} <span className="text-white/30">· {MEASUREMENT_GROUP_LABELS[m.group]}</span>
                    </dt>
                    <dd className="tabular-nums">
                      {saved[m.key]} {m.unit}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
          {c.profile && !anonymised ? (
            <Panel title="Internal notes">
              <NotesEditor id={c.user.id} initial={c.profile.internalNotes} />
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
