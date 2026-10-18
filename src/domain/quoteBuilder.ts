import type { ShippingMode } from "./enums";
import { parseFxRate, type Fen, type Sen } from "./money";
import { computeQuote, type QuoteBreakdown } from "./quote";
import type { Settings } from "./settings";
import { estimateShipping, type EstimateSource, type Parcel, type ShippingEstimate } from "./shipping";

// The admin quote builder's arithmetic. The drawer runs this for the live
// preview and the server runs it again on send, so totals are never typed in
// or trusted from the browser — only the inputs are.

export interface QuoteBuilderInput {
  /** Total item price for the whole quantity, in fen. */
  itemPriceFen: Fen;
  /** MYR per CNY as a decimal string (snapshotted on the quote). */
  fxRate: string;
  serviceFeeSen: Sen;
  shippingMode: ShippingMode;
  /** Per-item parcel: seller-confirmed, or the category default. */
  parcel: Parcel;
  source: EstimateSource;
  quantity: number;
  deliveryFeeSen: Sen;
  /** Upfront fee already paid, credited toward this order. */
  feeCreditSen: Sen;
}

export interface BuiltQuote {
  shipping: ShippingEstimate;
  breakdown: QuoteBreakdown;
}

export function buildQuote(input: QuoteBuilderInput, settings: Settings): BuiltQuote {
  const fxRate = parseFxRate(input.fxRate);
  const shipping = estimateShipping({
    mode: input.shippingMode,
    parcel: input.parcel,
    source: input.source,
    quantity: input.quantity,
    fxRate,
    settings,
  });
  const breakdown = computeQuote({
    itemPriceFen: input.itemPriceFen,
    fxRate,
    serviceFeeSen: input.serviceFeeSen,
    shippingMinSen: shipping.minSen,
    shippingMaxSen: shipping.maxSen,
    deliveryFeeSen: input.deliveryFeeSen,
    feeCreditSen: input.feeCreditSen,
  });
  return { shipping, breakdown };
}
