"use client";

import { ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import { loadQuoteContext, sendQuoteAction } from "@/app/admin/_actions/orders";
import { Field } from "@/components/admin/ui";
import { SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatCny, formatMyr } from "@/domain/money";
import { buildQuote } from "@/domain/quoteBuilder";
import { Sheet } from "../Sheet";
import { DrawerActions, ErrorNote, Loading, MoneyInput, type DialogProps, minorToInput, parseMinor, parseScaled, scaledToInput, useAction, useLoaded } from "./shared";

type Ctx = Extract<Awaited<ReturnType<typeof loadQuoteContext>>, { ok: true }>["data"];

export function QuoteDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Send quote" description={`Order #${orderId}`} size="lg">
      <QuoteBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function QuoteBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadQuoteContext({ orderId }));
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  return <QuoteForm ctx={ctx.data} onDone={onDone} onCancel={onCancel} />;
}

function QuoteForm({ ctx, onDone, onCancel }: { ctx: Ctx; onDone: (m: string) => void; onCancel: () => void }) {
  const id = useId();
  const { order, selected, sellerParcel, lastQuote, defaults, settings } = ctx;
  const seed = selected
    ? { weightG: selected.weightG, lengthMm: selected.lengthMm, widthMm: selected.widthMm, heightMm: selected.heightMm }
    : sellerParcel;
  const [itemPrice, setItemPrice] = useState(minorToInput(lastQuote?.itemPriceFen ?? (selected ? selected.priceFen * order.quantity : null)));
  const [fxRate, setFxRate] = useState(lastQuote ? Number(lastQuote.fxRate).toString() : Number(defaults.fxRate).toString());
  const [serviceFee, setServiceFee] = useState(minorToInput(lastQuote?.serviceFeeSen ?? defaults.serviceFeeSen));
  const [deliveryFee, setDeliveryFee] = useState(minorToInput(lastQuote?.deliveryFeeSen ?? defaults.deliveryFeeSen));
  const [mode, setMode] = useState(ctx.modes.includes(order.shippingMode) ? order.shippingMode : (ctx.modes[0] ?? order.shippingMode));
  const [sellerConfirmed, setSellerConfirmed] = useState(Boolean(seed?.weightG));
  const [weight, setWeight] = useState(scaledToInput(seed?.weightG ?? ctx.category.defaultParcel.weightG, 1000));
  const [length, setLength] = useState(scaledToInput(seed?.lengthMm ?? ctx.category.defaultParcel.lengthMm, 10));
  const [width, setWidth] = useState(scaledToInput(seed?.widthMm ?? ctx.category.defaultParcel.widthMm, 10));
  const [height, setHeight] = useState(scaledToInput(seed?.heightMm ?? ctx.category.defaultParcel.heightMm, 10));
  const { pending, error, fieldErrors, run } = useAction();

  const parsed = {
    itemPriceFen: parseMinor(itemPrice),
    serviceFeeSen: parseMinor(serviceFee) ?? 0,
    deliveryFeeSen: parseMinor(deliveryFee) ?? 0,
    parcel: { weightG: parseScaled(weight, 1000) ?? 0, lengthMm: parseScaled(length, 10) ?? 0, widthMm: parseScaled(width, 10) ?? 0, heightMm: parseScaled(height, 10) ?? 0 },
  };
  const valid =
    parsed.itemPriceFen !== null &&
    Number.isFinite(parsed.itemPriceFen) &&
    parsed.itemPriceFen > 0 &&
    /^\d{1,6}(\.\d{1,6})?$/.test(fxRate) &&
    Number.isFinite(parsed.serviceFeeSen) &&
    Number.isFinite(parsed.deliveryFeeSen) &&
    Object.values(parsed.parcel).every(Number.isFinite);

  const preview = (() => {
    if (!valid) return null;
    try {
      return buildQuote(
        {
          itemPriceFen: parsed.itemPriceFen!,
          fxRate,
          serviceFeeSen: parsed.serviceFeeSen,
          shippingMode: mode,
          parcel: sellerConfirmed ? parsed.parcel : ctx.category.defaultParcel,
          source: sellerConfirmed ? "seller_confirmed" : "category_default",
          quantity: order.quantity,
          deliveryFeeSen: parsed.deliveryFeeSen,
          feeCreditSen: ctx.feeCreditSen,
        },
        settings,
      );
    } catch {
      return null;
    }
  })();

  const blocked = order.restrictedHold ? "Clear the restricted-item review first." : order.feeUnpaid ? "Mark the upfront fee paid first." : null;

  function send() {
    if (!valid || !preview) return;
    run(
      () =>
        sendQuoteAction({
          orderId: order.id,
          itemPriceFen: parsed.itemPriceFen,
          fxRate,
          serviceFeeSen: parsed.serviceFeeSen,
          shippingMode: mode,
          sellerConfirmed,
          parcel: parsed.parcel,
          deliveryFeeSen: parsed.deliveryFeeSen,
        }),
      (_, message) => onDone(message ?? "Quote sent"),
    );
  }

  return (
    <div className="space-y-6 pb-2">
      <div>
        <p className="font-medium">{order.itemName}</p>
        <p className="text-sm text-white/55">
          {ctx.category.name} · quantity {order.quantity}
          {order.productUrl ? (
            <>
              {" · "}
              <a href={order.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-300 underline underline-offset-2">
                listing
              </a>
            </>
          ) : null}
        </p>
        {selected ? (
          <p className="mt-2 rounded-xl border border-sky-400/25 bg-sky-500/5 p-3 text-sm">
            Student chose <span className="font-medium">{selected.title}</span> at {formatCny(selected.priceFen)} each.
          </p>
        ) : null}
        {ctx.category.restrictedNote ? <p className="mt-2 text-sm text-warning">{ctx.category.restrictedNote}</p> : null}
      </div>
      {blocked ? (
        <p className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {blocked}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Item price (all ${order.quantity})`} htmlFor={`${id}-price`} error={fieldErrors.itemPriceFen}>
          <MoneyInput id={`${id}-price`} currency="¥" value={itemPrice} onChange={setItemPrice} invalid={!!fieldErrors.itemPriceFen} />
        </Field>
        <Field label="Exchange rate (MYR per ¥1)" htmlFor={`${id}-fx`} hint="Saved with this quote." error={fieldErrors.fxRate}>
          <input id={`${id}-fx`} inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} className="admin-input tabular-nums" />
        </Field>
        <Field label="Coordination fee" htmlFor={`${id}-fee`}>
          <MoneyInput id={`${id}-fee`} currency="RM" value={serviceFee} onChange={setServiceFee} />
        </Field>
        <Field label="Delivery fee" htmlFor={`${id}-delivery`} hint={order.fulfilment === "lalamove" ? "Lalamove" : "Campus pickup is free"}>
          <MoneyInput id={`${id}-delivery`} currency="RM" value={deliveryFee} onChange={setDeliveryFee} />
        </Field>
        <Field label="Shipping mode" htmlFor={`${id}-mode`} className="sm:col-span-2" error={fieldErrors.shippingMode}>
          <select id={`${id}-mode`} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="admin-input">
            {ctx.modes.map((m) => (
              <option key={m} value={m}>
                {SHIPPING_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-white/85">Size per item</legend>
        <div className="flex gap-2" role="radiogroup">
          {[
            { v: true, label: "Seller-confirmed" },
            { v: false, label: "Category default" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={sellerConfirmed === o.v}
              onClick={() => setSellerConfirmed(o.v)}
              className="admin-chip aria-checked:border-white aria-checked:bg-white aria-checked:text-black"
            >
              {o.label}
            </button>
          ))}
        </div>
        {sellerConfirmed ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Weight (kg)" htmlFor={`${id}-w`}>
              <input id={`${id}-w`} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="admin-input" />
            </Field>
            <Field label="Length (cm)" htmlFor={`${id}-l`}>
              <input id={`${id}-l`} inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} className="admin-input" />
            </Field>
            <Field label="Width (cm)" htmlFor={`${id}-wd`}>
              <input id={`${id}-wd`} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} className="admin-input" />
            </Field>
            <Field label="Height (cm)" htmlFor={`${id}-h`}>
              <input id={`${id}-h`} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} className="admin-input" />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-white/55">
            {ctx.category.name} default: {(ctx.category.defaultParcel.weightG / 1000).toFixed(2)} kg,{" "}
            {[ctx.category.defaultParcel.lengthMm, ctx.category.defaultParcel.widthMm, ctx.category.defaultParcel.heightMm].map((v) => v / 10).join(" × ")} cm. The
            range gets more headroom.
          </p>
        )}
      </fieldset>

      <section className="admin-card p-4" aria-live="polite">
        <h3 className="text-sm font-medium">The student sees</h3>
        {preview ? (
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row
              label={`Item (${formatCny(parsed.itemPriceFen!)} at ${fxRate})`}
              value={formatMyr(preview.breakdown.itemPriceSen)}
            />
            <Row label="Coordination fee" value={formatMyr(preview.breakdown.serviceFeeSen)} />
            {preview.shipping.applies ? (
              <Row
                label={`Shipping estimate (${(preview.shipping.billableG / 1000).toFixed(2)}–${(preview.shipping.billableMaxG / 1000).toFixed(2)} kg)`}
                value={`${formatMyr(preview.breakdown.shippingMinSen)} – ${formatMyr(preview.breakdown.shippingMaxSen)}`}
              />
            ) : (
              <Row label="Shipping" value={mode === "pdd_direct" ? "Set by PDD" : "None"} />
            )}
            {preview.breakdown.deliveryFeeSen > 0 ? <Row label="Delivery" value={formatMyr(preview.breakdown.deliveryFeeSen)} /> : null}
            {preview.breakdown.feeCreditSen > 0 ? <Row label="Search / consultation fee credit" value={`−${formatMyr(preview.breakdown.feeCreditSen)}`} /> : null}
            <div className="mt-2 border-t border-white/10 pt-2">
              <Row label="Total" value={`${formatMyr(preview.breakdown.totalMinSen)} – ${formatMyr(preview.breakdown.totalMaxSen)}`} />
              <Row label={<strong>Pays now (top of range)</strong>} value={<strong>{formatMyr(preview.breakdown.payableNowSen)}</strong>} />
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-white/50">Fill in the item price and sizes to see the quote.</p>
        )}
      </section>

      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        <button type="button" onClick={send} disabled={pending || !preview || !!blocked} className="admin-btn-primary">
          {pending ? "Sending…" : order.status === "quote_sent" ? "Send revised quote" : "Send quote"}
        </button>
      </DrawerActions>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-white/60">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
