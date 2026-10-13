import { assertMinorUnits, fenToSen, type Fen, type FxRateMicro, type Sen } from "./money";

export interface QuoteInput {
  /** Total item price for the whole quantity, in fen. */
  itemPriceFen: Fen;
  fxRate: FxRateMicro;
  serviceFeeSen: Sen;
  shippingMinSen: Sen;
  shippingMaxSen: Sen;
  deliveryFeeSen: Sen;
  /** Upfront reverse-search / consultation fee credited toward this order. */
  feeCreditSen?: Sen;
}

export interface QuoteBreakdown {
  itemPriceSen: Sen;
  serviceFeeSen: Sen;
  shippingMinSen: Sen;
  shippingMaxSen: Sen;
  deliveryFeeSen: Sen;
  /** Credit actually applied — never more than the lowest total. */
  feeCreditSen: Sen;
  totalMinSen: Sen;
  totalMaxSen: Sen;
  /**
   * Collected when the quote is accepted: the TOP of the range. Shipping is
   * reconciled against this after the warehouse weigh-in.
   */
  payableNowSen: Sen;
  /** Shipping portion of payableNowSen (= shippingMaxSen). */
  shippingCollectedSen: Sen;
}

/**
 * Every component is kept separate so the student sees item, service fee and
 * shipping range individually. Totals are derived, never entered by hand.
 */
export function computeQuote(input: QuoteInput): QuoteBreakdown {
  const credit = input.feeCreditSen ?? 0;
  const parts = {
    itemPriceFen: input.itemPriceFen,
    serviceFeeSen: input.serviceFeeSen,
    shippingMinSen: input.shippingMinSen,
    shippingMaxSen: input.shippingMaxSen,
    deliveryFeeSen: input.deliveryFeeSen,
    feeCreditSen: credit,
  };
  for (const [label, value] of Object.entries(parts)) {
    assertMinorUnits(value, label);
    if (value < 0) throw new RangeError(`${label} must be ≥ 0`);
  }
  if (input.shippingMinSen > input.shippingMaxSen) {
    throw new RangeError("shippingMinSen must be ≤ shippingMaxSen");
  }

  const itemPriceSen = fenToSen(input.itemPriceFen, input.fxRate);
  const base = itemPriceSen + input.serviceFeeSen + input.deliveryFeeSen;
  const grossMin = base + input.shippingMinSen;
  const grossMax = base + input.shippingMaxSen;
  const appliedCredit = Math.min(credit, grossMin);

  return {
    itemPriceSen,
    serviceFeeSen: input.serviceFeeSen,
    shippingMinSen: input.shippingMinSen,
    shippingMaxSen: input.shippingMaxSen,
    deliveryFeeSen: input.deliveryFeeSen,
    feeCreditSen: appliedCredit,
    totalMinSen: grossMin - appliedCredit,
    totalMaxSen: grossMax - appliedCredit,
    payableNowSen: grossMax - appliedCredit,
    shippingCollectedSen: input.shippingMaxSen,
  };
}
