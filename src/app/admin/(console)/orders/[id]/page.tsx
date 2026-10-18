import { ArrowLeft, Clock, ExternalLink, Mail, ShieldAlert, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Rows } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { needsUpfrontFee, waiting } from "@/domain/adminQueue";
import { describeDetails } from "@/domain/categorySchema";
import { ADMIN_PATH_LABELS, ADMIN_STATUS_LABELS, PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { renderTemplate, TEMPLATE_KEYS, TEMPLATE_LABELS, waLink } from "@/domain/messages";
import { canTransition } from "@/domain/orderStateMachine";
import { templateText } from "@/domain/settings";
import { fmtDate, fmtDateTime, formatCny, formatMyr, orderNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOrderForAdmin } from "@/server/data/admin";
import { getSettings } from "@/server/data/catalog";
import { getCatalog } from "@/server/data/categories";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { DrawerButton, OverflowMenu, PrimaryAction, Section, WhatsAppButton } from "./OrderControls";

export const metadata: Metadata = { title: "Order" };

const CONDITION: Record<string, string> = { new_only: "New only", secondhand_ok: "Second-hand OK", either: "Either" };
const LEDGER_LABELS: Record<string, string> = {
  service_fee: "Coordination fee",
  item_payment: "Item",
  shipping_estimate: "Shipping (top of estimate)",
  shipping_adjustment: "Shipping adjustment",
  refund: "Credit",
  delivery_fee: "Delivery",
  consultation_fee: "Consultation fee",
  reverse_search_fee: "Photo search fee",
  payment: "Payment received",
  payout: "Refund sent",
};

export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Need Action
      </Link>
      <Suspense fallback={<div className="mt-4 h-128 animate-pulse rounded-2xl bg-white/5" />}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  );
}

async function load(id: string) {
  await requireAdmin();
  const orderId = /^\d{1,10}$/.test(id) ? Number(id) : NaN;
  const db = getDb();
  const [detail, catalog, settings] = await Promise.all([getOrderForAdmin(db, orderId), getCatalog(db), getSettings(db)]);
  if (!detail) return null;
  const store = getPhotoStore();
  const { order } = detail;
  const keys = [
    ...order.referencePhotoKeys,
    ...order.qcPhotoKeys,
    ...detail.options.flatMap((o) => (o.photoKey ? [o.photoKey] : [])),
    ...detail.payments.flatMap((p) => (p.proofPhotoKey ? [p.proofPhotoKey] : [])),
  ];
  return { detail, catalog, settings, images: await imageUrlMap(store, keys), now: Date.now() };
}

async function OrderDetail({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { detail, catalog, settings, images, now } = data;
  const { order, customer, action, category } = detail;
  const wait = waiting(detail.waitingSince, new Date(now));
  const ctx = { actor: "admin" as const, shippingMode: order.shippingMode };
  const can = {
    needsInfo: canTransition(order.status, "needs_info", ctx),
    reject: canTransition(order.status, "rejected", ctx),
    cancel: canTransition(order.status, "cancelled", ctx),
  };
  const held = order.restrictedFlag && !order.restrictedClearedAt;
  const quotable = ["submitted", "sourcing", "quote_sent"].includes(order.status) && !held && !(needsUpfrontFee(order) && !order.feePaidAt);
  const sourcing = needsUpfrontFee(order);

  const vars = {
    name: customer.name.split(/\s+/)[0],
    order: orderNo(order.id),
    item: order.itemName,
    amount: formatMyr(detail.balance.owedSen || detail.quote?.totalMaxSen || 0),
    pickup_point: settings.pickup.pointName,
    pickup_window: settings.pickup.windowText,
    tracking: order.trackingNumber ?? "",
  };
  const waLinks = customer.phone
    ? TEMPLATE_KEYS.map((k) => ({ label: TEMPLATE_LABELS[k], href: waLink(customer.phone!, renderTemplate(templateText(settings, k), vars)) }))
    : [];
  const rows = category ? describeDetails(category.definition, catalog.measurements, order.details) : [];

  return (
    <div className="mt-2 pb-24 lg:pb-0">
      {/* 1. Header */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="display text-5xl sm:text-6xl">Order {orderNo(order.id)}</h1>
          <p className="mt-1 text-xl font-medium">{order.itemName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="info">{ADMIN_STATUS_LABELS[order.status]}</Badge>
            <Badge tone={detail.payment.tone === "warning" ? "warning" : detail.payment.tone === "paid" ? "success" : "neutral"}>{detail.payment.label}</Badge>
            <span className={cn("flex items-center gap-1", wait.level === 2 ? "text-destructive" : wait.level === 1 ? "text-warning" : "text-white/55")}>
              <Clock className="size-3.5" aria-hidden />
              {wait.label}
            </span>
            <span className="text-white/45">· placed {fmtDate(order.createdAt, "d MMM yyyy")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {action ? (
            <div className="hidden lg:block">
              <PrimaryAction orderId={order.id} status={order.status} action={action} restrictedReason={order.restrictedReason} />
            </div>
          ) : (
            <p className="hidden max-w-56 text-sm text-white/50 lg:block">Waiting on the student, the seller or the batch.</p>
          )}
          <OverflowMenu orderId={order.id} can={can} initial={{ notes: order.internalNotes, trackingNumber: order.trackingNumber, trackingNote: order.trackingNote }} />
        </div>
      </header>
      {action ? <PrimaryAction orderId={order.id} status={order.status} action={action} restrictedReason={order.restrictedReason} pinned /> : null}

      {held ? (
        <p className="mt-4 flex gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Held for restricted-item review{order.restrictedReason ? `: ${order.restrictedReason}` : "."} No quote can go out until it&apos;s cleared.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {/* 3. Request */}
          <Section title="Request">
            {order.productUrl ? (
              <a href={order.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="mb-3 flex items-center gap-1.5 truncate text-sky-300 underline underline-offset-2">
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{order.productUrl}</span>
              </a>
            ) : null}
            <Rows
              rows={[
                ["Path", `${ADMIN_PATH_LABELS[order.pathType]} · ${PLATFORM_LABELS[order.platform]}`],
                ["Item", order.itemName],
                ["Quantity", order.quantity],
                order.variantText ? [category?.definition.option?.label ?? "Option", order.variantText] : null,
                order.conditionPreference ? ["Condition", CONDITION[order.conditionPreference]] : null,
                order.domesticFreeShipping ? ["China shipping", "Free on this listing (包邮)"] : null,
                order.remarks ? ["Remarks", <span key="r" className="whitespace-pre-line">{order.remarks}</span>] : null,
              ]}
            />
            <Photos keys={order.referencePhotoKeys} images={images} label="Reference photo" />
          </Section>

          {/* 4. Category details */}
          <Section
            title={category ? `${category.category.name} details` : "Category details"}
            aside={category ? <span className="text-xs text-white/45">version {category.version}</span> : null}
            actions={
              <DrawerButton drawer="details" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                Edit
              </DrawerButton>
            }
          >
            {rows.length ? <Rows rows={rows.map((r) => [r.label, r.value])} /> : <p className="text-white/50">No details for this category.</p>}
          </Section>

          {/* 5. Sourcing options */}
          {sourcing ? (
            <Section
              title="Sourcing options"
              aside={order.optionsSentAt ? <Badge tone="info">sent {fmtDate(order.optionsSentAt, "d MMM")}</Badge> : null}
              actions={
                ["submitted", "sourcing"].includes(order.status) ? (
                  <DrawerButton drawer="options" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                    {detail.options.length ? "Manage" : "Add options"}
                  </DrawerButton>
                ) : null
              }
            >
              {detail.options.length === 0 ? (
                <p className="text-white/50">{order.feePaidAt ? "No options yet." : "Waiting for the upfront fee before sourcing."}</p>
              ) : (
                <ol className="space-y-2">
                  {detail.options.map((o) => (
                    <li key={o.id} className={cn("flex gap-3 rounded-xl border border-white/10 p-3", o.isSelected && "border-sky-400/50 bg-sky-500/5")}>
                      {o.photoKey && images[o.photoKey] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
                        <img src={images[o.photoKey].thumb} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                      ) : null}
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {o.title}
                          {o.isRecommended ? <Star className="size-3.5 fill-warning text-warning" aria-label="Recommended" /> : null}
                          {o.isSelected ? <Badge tone="info">student&apos;s pick</Badge> : null}
                        </p>
                        <p className="tabular-nums">{formatCny(o.priceFen)}</p>
                        <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-sky-300">
                          {o.url}
                        </a>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          ) : null}

          {/* 6. Quote */}
          <Section
            title="Quote"
            aside={detail.quote ? <Badge tone={detail.quote.status === "accepted" ? "success" : detail.quote.status === "sent" ? "info" : "neutral"}>{detail.quote.status}</Badge> : null}
            actions={
              quotable ? (
                <DrawerButton drawer="quote" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                  {detail.quote?.status === "sent" ? "Revise" : "Build quote"}
                </DrawerButton>
              ) : null
            }
          >
            {detail.quote ? (
              <>
                <Rows
                  rows={[
                    [`Item (${formatCny(detail.quote.itemPriceFen)} at ${Number(detail.quote.fxRate).toFixed(4)})`, formatMyr(detail.quote.itemPriceSen)],
                    ["Coordination fee", formatMyr(detail.quote.serviceFeeSen)],
                    ["Shipping estimate", `${formatMyr(detail.quote.shippingEstimateMinSen)} – ${formatMyr(detail.quote.shippingEstimateMaxSen)}`],
                    detail.quote.deliveryFeeSen ? ["Delivery", formatMyr(detail.quote.deliveryFeeSen)] : null,
                    detail.quote.feeCreditSen ? ["Fee credit", `−${formatMyr(detail.quote.feeCreditSen)}`] : null,
                    [<strong key="t">Total</strong>, <strong key="v">{`${formatMyr(detail.quote.totalMinSen)} – ${formatMyr(detail.quote.totalMaxSen)}`}</strong>],
                  ]}
                />
                <p className="mt-2 text-xs text-white/45">
                  {detail.quote.status === "sent" ? `Expires ${fmtDateTime(detail.quote.expiresAt)}` : detail.quote.respondedAt ? `${detail.quote.status} ${fmtDateTime(detail.quote.respondedAt)}` : null}
                </p>
              </>
            ) : (
              <p className="text-white/50">No quote yet.</p>
            )}
          </Section>

          {/* 8. Warehouse & QC */}
          {order.shippingMode !== "none" && order.shippingMode !== "pdd_direct" ? (
            <Section
              title="Warehouse & QC"
              actions={
                order.status === "at_warehouse" || order.status === "qc_review" ? (
                  <DrawerButton drawer="qc" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                    {order.status === "at_warehouse" ? "Record QC" : "Edit QC"}
                  </DrawerButton>
                ) : null
              }
            >
              <Rows
                rows={[
                  ["Arrived", order.warehouseArrivedAt ? fmtDate(order.warehouseArrivedAt, "d MMM yyyy") : "—"],
                  ["Estimated", order.estWeightG ? `${(order.estWeightG / 1000).toFixed(2)} kg${order.estSellerConfirmed ? " (seller)" : " (category default)"}` : "—"],
                  [
                    "Final",
                    order.finalWeightG
                      ? `${(order.finalWeightG / 1000).toFixed(2)} kg${order.finalLengthMm ? ` · ${[order.finalLengthMm, order.finalWidthMm, order.finalHeightMm].map((v) => (v ?? 0) / 10).join(" × ")} cm` : ""}`
                      : "—",
                  ],
                  order.qcNotes ? ["QC notes", <span key="q" className="whitespace-pre-line">{order.qcNotes}</span>] : null,
                ]}
              />
              <Photos keys={order.qcPhotoKeys} images={images} label="QC photo" />
            </Section>
          ) : null}

          {/* 11. Timeline */}
          <Section title="Timeline">
            <ol className="space-y-3">
              {detail.history.toReversed().map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", i === 0 ? "bg-sky-400" : "bg-white/25")} />
                  <div className="min-w-0">
                    <p>
                      {h.fromStatus === h.toStatus ? <span className="text-white/70">Note</span> : ADMIN_STATUS_LABELS[h.toStatus]}
                      <span className="text-white/45"> · {h.actorName ? (h.actorRole === "admin" ? h.actorName : "Customer") : "System"}</span>
                    </p>
                    <p className="text-xs text-white/45">{fmtDateTime(h.createdAt)}</p>
                    {h.note ? <p className="mt-0.5 whitespace-pre-line text-white/75">{h.note}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-4">
          {/* 2. Customer */}
          <Section title="Customer">
            <p className="font-medium">
              <Link href={`/admin/customer/${customer.id}`} className="link-underline">
                {customer.name}
              </Link>
            </p>
            <p className="text-white/55">
              {customer.campus ?? "No campus"} · {customer.pastOrders} other order{customer.pastOrders === 1 ? "" : "s"}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {customer.phone ? <WhatsAppButton links={waLinks} /> : <p className="text-white/50">No phone number on file.</p>}
              <a href={`mailto:${customer.email}`} className="admin-btn-secondary justify-start">
                <Mail className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{customer.email}</span>
              </a>
            </div>
          </Section>

          {/* 7. Payments & ledger */}
          <Section
            title="Payments & ledger"
            actions={
              detail.payments.some((p) => p.status === "pending") ? (
                <DrawerButton drawer="payment" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                  Review proof
                </DrawerButton>
              ) : null
            }
          >
            <p className="text-base">
              {detail.balance.owedSen > 0 ? (
                <>
                  Owes <strong className="tabular-nums">{formatMyr(detail.balance.owedSen)}</strong>
                </>
              ) : detail.balance.creditSen > 0 ? (
                <>
                  In credit <strong className="text-success tabular-nums">{formatMyr(detail.balance.creditSen)}</strong>
                </>
              ) : (
                <span className="text-white/60">Settled</span>
              )}
            </p>
            {detail.ledger.length ? (
              <ul className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
                {detail.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3">
                    <span className="min-w-0 text-white/70">
                      {LEDGER_LABELS[l.type] ?? l.type}
                      <span className="block text-xs text-white/40">{fmtDate(l.createdAt, "d MMM")}</span>
                    </span>
                    <span className={cn("tabular-nums", l.amountSen < 0 && "text-success")}>{l.amountSen < 0 ? `−${formatMyr(-l.amountSen)}` : formatMyr(l.amountSen)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.payments.length ? (
              <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
                {detail.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    {p.proofPhotoKey && images[p.proofPhotoKey] ? (
                      <a href={images[p.proofPhotoKey].full} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL */}
                        <img src={images[p.proofPhotoKey].thumb} alt="Payment proof" className="size-10 rounded-lg object-cover" />
                      </a>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="tabular-nums">{formatMyr(p.amountSen)}</p>
                      <p className="truncate text-xs text-white/45">{p.purpose.replace("_", " ")}{p.rejectionReason ? ` · ${p.rejectionReason}` : ""}</p>
                    </div>
                    <Badge tone={p.status === "confirmed" ? "success" : p.status === "pending" ? "info" : "danger"}>{p.status === "failed" ? "rejected" : p.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {order.status === "awaiting_payment" && detail.balance.owedSen > 0 ? (
                <DrawerButton drawer="record" orderId={order.id} className="text-xs text-sky-300 hover:underline">
                  Record payment…
                </DrawerButton>
              ) : null}
              <DrawerButton drawer="refund" orderId={order.id} className="text-xs text-white/60 hover:text-white hover:underline">
                Refund / credit…
              </DrawerButton>
            </div>
          </Section>

          {/* 10. Batch + shipping */}
          <Section
            title="Shipping & batch"
            actions={
              ["paid", "order_submitted", "at_warehouse", "qc_review", "ready_to_consolidate"].includes(order.status) && ["air", "air_sensitive", "sea"].includes(order.shippingMode) ? (
                <DrawerButton drawer="batch" orderId={order.id} className="text-sm text-sky-300 hover:underline">
                  {detail.batch ? "Move" : "Add to batch"}
                </DrawerButton>
              ) : null
            }
          >
            <Rows
              rows={[
                ["Mode", SHIPPING_MODE_LABELS[order.shippingMode]],
                ["Delivery", order.fulfilment === "lalamove" ? "Lalamove" : "Campus pickup"],
                [
                  "Batch",
                  detail.batch ? (
                    <Link key="b" href={`/admin/batches/${detail.batch.id}`} className="link-underline">
                      {detail.batch.code} · {detail.batch.status}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
              ]}
            />
          </Section>

          {/* 9. Tracking */}
          <Section
            title="Tracking"
            actions={
              <DrawerButton drawer="tracking" orderId={order.id} initial={{ trackingNumber: order.trackingNumber, trackingNote: order.trackingNote }} className="text-sm text-sky-300 hover:underline">
                Edit
              </DrawerButton>
            }
          >
            {order.trackingNumber ? <p className="font-mono text-xs break-all">{order.trackingNumber}</p> : <p className="text-white/50">No tracking number.</p>}
            {order.trackingNote ? <p className="mt-1 whitespace-pre-line text-white/70">{order.trackingNote}</p> : null}
          </Section>

          {/* 12. Internal notes */}
          <Section
            title="Internal notes"
            actions={
              <DrawerButton drawer="notes" orderId={order.id} initial={{ notes: order.internalNotes }} className="text-sm text-sky-300 hover:underline">
                Edit
              </DrawerButton>
            }
          >
            {order.internalNotes ? <p className="whitespace-pre-line text-white/80">{order.internalNotes}</p> : <p className="text-white/50">None. Only admins see these.</p>}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Photos({ keys, images, label }: { keys: string[]; images: Record<string, { full: string; thumb: string }>; label: string }) {
  if (keys.length === 0) return null;
  const shown = keys.filter((k) => images[k]);
  if (shown.length === 0) return <p className="mt-3 text-white/50">{keys.length} photo{keys.length === 1 ? "" : "s"} (storage isn&apos;t configured here).</p>;
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {shown.map((k, i) => (
        <li key={k}>
          <a href={images[k].full} target="_blank" rel="noopener noreferrer" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL */}
            <img src={images[k].thumb} alt={`${label} ${i + 1}`} className="size-24 rounded-xl border border-white/10 object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

