import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { QuoteBreakdown } from "@/components/order/QuoteBreakdown";
import { StatusBadge } from "@/components/order/StatusBadge";
import { Timeline } from "@/components/order/Timeline";
import { getDb } from "@/db/client";
import { describeDetails } from "@/domain/categorySchema";
import { PATH_LABELS, PLATFORM_LABELS, SHIPPING_MODE_LABELS, STATUS_LABELS } from "@/domain/labels";
import { fmtDate, fmtDateShort, formatMyr, orderNo } from "@/lib/format";
import { getSettings } from "@/server/data/catalog";
import { getCatalog } from "@/server/data/categories";
import { getOrderForCustomer, type CustomerOrderDetail } from "@/server/data/orders";
import { getSessionUser } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { GET_EXPIRES_S, isAdminImageKey, ownPhotoUrl, thumbKey } from "@/server/photos";
import { needsUpfrontFee } from "@/domain/adminQueue";
import type { PaymentPurpose } from "@/domain/enums";
import { upfrontFee } from "@/domain/fees";
import { isPrePayment } from "@/domain/orderStateMachine";
import { CancelOrder, OptionPicker, PayPanel, QuoteResponse, ReplyForm } from "./OrderActions";

export const metadata: Metadata = { title: "Order" };

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← My orders
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-card" />}>
        <OrderDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/orders/[id]">["params"];
  searchParams: PageProps<"/orders/[id]">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=/orders/${encodeURIComponent(id)}`);

  const orderId = /^\d{1,10}$/.test(id) ? Number(id) : NaN;
  const db = getDb();
  const [detail, settings, catalog] = await Promise.all([getOrderForCustomer(db, user.id, orderId), getSettings(db), getCatalog(db)]);
  // Someone else's order looks exactly like a missing one.
  if (!detail) notFound();
  const { order, history, quote, balance, batch } = detail;

  const store = getPhotoStore();
  const photos = store
    ? (await Promise.all(order.referencePhotoKeys.map((k) => ownPhotoUrl(store, user.id, k)))).filter((u): u is string => !!u)
    : [];
  const held = order.restrictedFlag && !order.restrictedClearedAt && order.status === "submitted";
  const signed = async (key: string | null, thumb = false) =>
    store && key && isAdminImageKey(key) ? store.presignGet(thumb ? thumbKey(key) : key, GET_EXPIRES_S) : null;

  // What the student can do right now.
  const question = order.status === "needs_info" ? (history.findLast((h) => h.toStatus === "needs_info")?.note ?? null) : null;
  const showOptions = order.status === "sourcing" && detail.options.length > 0;
  const options = showOptions
    ? await Promise.all(detail.options.map(async (o) => ({ ...o, photoUrl: await signed(o.photoKey, true) })))
    : [];
  const fee = upfrontFee(order.pathType, settings);
  const pay: { purpose: PaymentPurpose; title: string; amountSen: number } | null =
    needsUpfrontFee(order) && !order.feePaidAt && (order.status === "submitted" || order.status === "sourcing") && fee
      ? { purpose: "upfront_fee", title: "Pay the search fee to start", amountSen: balance.owedSen || fee.amountSen }
      : order.status === "awaiting_payment" && balance.owedSen > 0
        ? { purpose: "order", title: "Pay for your order", amountSen: balance.owedSen }
        : order.shippingBalanceDue && balance.owedSen > 0
          ? { purpose: "balance", title: "Pay the shipping balance", amountSen: balance.owedSen }
          : null;
  const ofPurpose = pay ? detail.payments.filter((p) => p.purpose === pay.purpose) : [];
  const waitingProof = ofPurpose.find((p) => p.status === "pending") ?? null;
  const lastRejected = ofPurpose.find((p) => p.status === "failed");
  const qrUrl = pay ? await signed(settings.store.duitnowQrKey) : null;
  const canCancel = isPrePayment(order.status) || order.status === "paid";
  // Only the very first history row can carry the reroute note.
  const rerouteNote = history.find((h) => h.fromStatus === null && h.toStatus === "submitted" && h.note)?.note;

  return (
    <div className="mt-6 space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          Order {orderNo(order.id)} · {fmtDateShort(order.createdAt)}
        </p>
        <h1 className="display mt-1 text-4xl sm:text-5xl">{order.itemName}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <span className="text-sm text-muted-foreground">{STATUS_LABELS[order.status].detail}</span>
        </div>
      </header>

      {sp.new ? (
        <Notice tone="success">
          Request received. We&apos;ll review it and send a quote — you&apos;ll get an email when it&apos;s ready.
        </Notice>
      ) : null}
      {held || sp.held ? (
        <Notice tone="warning">
          Some items (like batteries, liquids or magnets) need a special shipping line or can&apos;t be shipped at all.
          We&apos;re checking this one before we quote and will be in touch.
        </Notice>
      ) : null}
      {rerouteNote ? <Notice>Your link was a post rather than a product page, so we&apos;re treating this as a photo search.</Notice> : null}
      {order.shippingBalanceDue ? (
        <Notice tone="warning">A shipping balance is due. Your parcel is released once it&apos;s settled.</Notice>
      ) : null}

      {question !== null ? <ReplyForm orderId={order.id} question={question} /> : null}
      {showOptions ? <OptionPicker orderId={order.id} options={options} /> : null}
      {order.status === "quote_sent" && quote ? (
        <section className="space-y-4">
          <QuoteBreakdown quote={quote} />
          <QuoteResponse orderId={order.id} totalLabel={formatMyr(quote.totalMaxSen)} feeKept={needsUpfrontFee(order)} />
        </section>
      ) : null}
      {pay ? (
        <PayPanel
          orderId={order.id}
          purpose={pay.purpose}
          title={pay.title}
          amountDueSen={pay.amountSen}
          qrUrl={qrUrl}
          note={settings.store.paymentNote}
          waiting={waitingProof ? { amountSen: waitingProof.amountSen } : null}
          rejectedReason={!waitingProof && lastRejected ? lastRejected.rejectionReason : null}
          uploadsEnabled={store !== null}
        />
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Timeline status={order.status} mode={order.shippingMode} history={history} />
          {quote && order.status !== "quote_sent" ? <QuoteBreakdown quote={quote} /> : null}
          <Details
            detail={detail}
            photos={photos}
            rows={detail.category ? describeDetails(detail.category.definition, catalog.measurements, order.details) : []}
          />
          {canCancel ? <CancelOrder orderId={order.id} paid={order.status === "paid"} /> : null}
        </div>

        <aside className="space-y-4 text-sm">
          <Card title="Shipping">
            <p>{SHIPPING_MODE_LABELS[order.shippingMode]}</p>
            {order.shippingMode === "pdd_direct" ? <p className="text-muted-foreground">Delivery time set by PDD.</p> : null}
            {order.domesticFreeShipping ? (
              <p className="text-muted-foreground">Free shipping (包邮) on this listing covers China only; international shipping still applies.</p>
            ) : null}
            {batch ? (
              <p className="text-muted-foreground">
                Batch {batch.code} · cutoff {fmtDate(batch.cutoffAt, "d MMM")}
                {batch.pickupStartsAt ? ` · pickup from ${fmtDate(batch.pickupStartsAt, "d MMM, h:mm a")}` : ""}
              </p>
            ) : null}
            {order.shippingMode !== "none" ? (
              <p className="text-muted-foreground">
                {order.fulfilment === "lalamove" ? "Lalamove delivery" : `${settings.pickup.pointName} — ${settings.pickup.windowText}`}
              </p>
            ) : null}
          </Card>

          {order.trackingNumber || order.trackingNote ? (
            <Card title="Tracking">
              {order.trackingNumber ? <p className="font-mono text-xs break-all">{order.trackingNumber}</p> : null}
              {order.trackingNote ? <p className="whitespace-pre-line text-muted-foreground">{order.trackingNote}</p> : null}
            </Card>
          ) : null}

          {balance.balanceSen !== 0 ? (
            <Card title="Balance">
              {balance.owedSen > 0 ? (
                <p>
                  You owe <strong>{formatMyr(balance.owedSen)}</strong>
                </p>
              ) : (
                <p>
                  Credit <strong className="text-success">{formatMyr(balance.creditSen)}</strong> on your HaloHaul balance.
                  Ask us on WhatsApp if you&apos;d prefer a cash refund.
                </p>
              )}
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Details({
  detail,
  photos,
  rows,
}: {
  detail: CustomerOrderDetail;
  photos: string[];
  rows: Array<{ key: string; label: string; value: string }>;
}) {
  const { order, category } = detail;
  return (
    <section className="rounded-2xl bg-card p-5 text-sm">
      <h2 className="font-medium">Your request</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          {PATH_LABELS[order.pathType]} · {PLATFORM_LABELS[order.platform]}
        </dd>
        {order.productUrl ? (
          <>
            <dt className="text-muted-foreground">Link</dt>
            <dd className="truncate">
              <a href={order.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
                {order.productUrl}
              </a>
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Quantity</dt>
        <dd>{order.quantity}</dd>
        {category ? (
          <>
            <dt className="text-muted-foreground">Category</dt>
            <dd>{category.category.name}</dd>
          </>
        ) : null}
        {order.variantText ? (
          <>
            <dt className="text-muted-foreground">{category?.definition.option?.label ?? "Option"}</dt>
            <dd>{order.variantText}</dd>
          </>
        ) : null}
        {rows.map((r) => (
          <FragmentRow key={r.key} label={r.label} value={r.value} />
        ))}
        {order.remarks ? (
          <>
            <dt className="text-muted-foreground">Remarks</dt>
            <dd className="whitespace-pre-line">{order.remarks}</dd>
          </>
        ) : null}
      </dl>
      {photos.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {photos.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned R2 URL
            <img key={src} src={src} alt="Reference photo" className="size-24 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1 rounded-2xl bg-card p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone?: "success" | "warning" }) {
  return (
    <p
      role="status"
      className={
        tone === "success"
          ? "rounded-xl border border-success/30 bg-success/10 p-4 text-sm"
          : tone === "warning"
            ? "rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm"
            : "rounded-xl border border-white/15 bg-white/5 p-4 text-sm"
      }
    >
      {children}
    </p>
  );
}
