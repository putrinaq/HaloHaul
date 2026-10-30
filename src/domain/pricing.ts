import { BATCH_SHIPPING_MODES, type BatchShippingMode } from "./enums";
import { coordinationFeeSen } from "./fees";
import { fenToSen, parseFxRate, type Fen, type FxRateMicro, type Sen } from "./money";
import { computeQuote, type QuoteBreakdown } from "./quote";
import { reconcileShipping, type ReconciliationResult } from "./reconciliation";
import { findForwarder, type Settings } from "./settings";
import { consolidatedRateFen, estimateShipping, finalShippingCost, type Parcel, type ShippingEstimate } from "./shipping";

// Numbers for the public Pricing page. Everything is derived from Settings
// with the same functions the quote builder and weigh-in use, so the page can
// never promise something a real quote wouldn't charge.

export interface ShippingRateRow {
  mode: BatchShippingMode;
  /** Consolidated per-kg rate in ringgit at the default exchange rate. */
  perKgSen: Sen;
  minChargeSen: Sen;
  volumetricDivisor: number;
  transitDays: { min: number; max: number };
}

/** One row per shipping mode the default forwarder has a rate for. */
export function shippingRateRows(settings: Settings): ShippingRateRow[] {
  const fxRate = parseFxRate(settings.fx.defaultMyrPerCny);
  const forwarder = findForwarder(settings);
  return BATCH_SHIPPING_MODES.flatMap((mode) => {
    const rate = forwarder.rates[mode];
    if (!rate) return [];
    return [
      {
        mode,
        perKgSen: fenToSen(consolidatedRateFen(rate), fxRate),
        minChargeSen: rate.minChargeSen,
        volumetricDivisor: rate.volumetricDivisor,
        transitDays: settings.shipping.transitDays[mode],
      },
    ];
  });
}

/** The sample order on the Pricing page: one hoodie, seller-confirmed size, campus pickup. */
export const PRICING_EXAMPLE = {
  itemName: "Hoodie",
  itemPriceFen: 8_900 as Fen,
  parcel: { weightG: 600, lengthMm: 250, widthMm: 200, heightMm: 50 } satisfies Parcel,
  /** What the warehouse scale says when it arrives. */
  weighedG: 550,
};

export interface PricingExample {
  mode: BatchShippingMode;
  fxRate: FxRateMicro;
  itemPriceFen: Fen;
  shipping: ShippingEstimate;
  quote: QuoteBreakdown;
  /** Final shipping from the weigh-in, and how it settles against what was paid. */
  finalShippingSen: Sen;
  finalBillableG: number;
  settlement: ReconciliationResult;
}

/**
 * The sample order priced with today's settings: air if the forwarder ships
 * by air, otherwise the first mode it has. Null when no mode has a rate.
 */
export function pricingExample(settings: Settings): PricingExample | null {
  const rows = shippingRateRows(settings);
  const mode = rows.find((r) => r.mode === "air")?.mode ?? rows[0]?.mode;
  if (!mode) return null;

  const fxRate = parseFxRate(settings.fx.defaultMyrPerCny);
  const { itemPriceFen, parcel, weighedG } = PRICING_EXAMPLE;
  const shipping = estimateShipping({ mode, parcel, source: "seller_confirmed", quantity: 1, fxRate, settings });
  const quote = computeQuote({
    itemPriceFen,
    fxRate,
    serviceFeeSen: coordinationFeeSen(settings),
    shippingMinSen: shipping.minSen,
    shippingMaxSen: shipping.maxSen,
    deliveryFeeSen: 0,
  });
  const final = finalShippingCost({ mode, parcel: { ...parcel, weightG: weighedG }, fxRate, settings });
  const settlement = reconcileShipping({
    quotedMaxSen: quote.shippingMaxSen,
    paidSen: quote.shippingCollectedSen,
    actualSen: final.sen,
    capPct: settings.shipping.overRangeCapPct,
  });
  return { mode, fxRate, itemPriceFen, shipping, quote, finalShippingSen: final.sen, finalBillableG: final.billableG, settlement };
}
