import { fmtDateTime, formatCny, formatMyr } from "@/lib/format";
import type { CustomerOrderDetail } from "@/server/data/orders";

/** Every line separate: item, service fee, shipping range, delivery, credit. */
export function QuoteBreakdown({ quote }: { quote: NonNullable<CustomerOrderDetail["quote"]> }) {
  const hasShipping = quote.shippingEstimateMaxSen > 0;
  return (
    <section className="rounded-2xl bg-card p-5">
      <h2 className="font-medium">Quote</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label={`Item (${formatCny(quote.itemPriceFen)} at ${Number(quote.fxRate).toFixed(4)})`} value={formatMyr(quote.itemPriceSen)} />
        <Row label="Coordination fee" value={formatMyr(quote.serviceFeeSen)} />
        {hasShipping ? (
          <Row
            label="Shipping estimate"
            value={`${formatMyr(quote.shippingEstimateMinSen)} – ${formatMyr(quote.shippingEstimateMaxSen)}`}
          />
        ) : null}
        {quote.deliveryFeeSen > 0 ? <Row label="Lalamove delivery" value={formatMyr(quote.deliveryFeeSen)} /> : null}
        {quote.feeCreditSen > 0 ? <Row label="Search / consultation fee credit" value={`−${formatMyr(quote.feeCreditSen)}`} /> : null}
        <div className="border-t border-white/10 pt-2">
          <Row
            label={<strong>Pay now</strong>}
            value={<strong>{formatMyr(quote.totalMaxSen)}</strong>}
          />
        </div>
      </dl>
      {hasShipping ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Shipping is collected at the top of the estimate. After the warehouse weigh-in, anything less is credited to
          your HaloHaul balance; if it&apos;s heavier, the extra is capped and settled before release.
        </p>
      ) : null}
      {quote.status === "sent" ? (
        <p className="mt-2 text-xs text-muted-foreground">Valid until {fmtDateTime(quote.expiresAt)}.</p>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
