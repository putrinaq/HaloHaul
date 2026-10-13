import type { ShippingMode } from "./enums";
import { isBatchShippingMode } from "./enums";
import { fenToSen, type Fen, type FxRateMicro, type Sen } from "./money";
import type { Rate, Settings } from "./settings";
import { findForwarder } from "./settings";

// All weights are integer grams; all dimensions are integer millimetres.

export interface Parcel {
  weightG: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export type EstimateSource = "seller_confirmed" | "category_default";

function assertNonNegInt(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
  }
}

function assertParcel(p: Parcel) {
  assertNonNegInt(p.weightG, "weightG");
  assertNonNegInt(p.lengthMm, "lengthMm");
  assertNonNegInt(p.widthMm, "widthMm");
  assertNonNegInt(p.heightMm, "heightMm");
}

/**
 * Volumetric weight in grams: L×W×H (cm³) ÷ divisor (cm³/kg).
 * In mm: (L×W×H mm³ / 1000) / divisor × 1000 g = L×W×H / divisor.
 * Rounded up — a partial gram is still weight.
 */
export function volumetricWeightG(p: Parcel, divisor = 6000): number {
  assertParcel(p);
  if (!Number.isSafeInteger(divisor) || divisor <= 0) throw new RangeError("divisor must be > 0");
  const volume = BigInt(p.lengthMm) * BigInt(p.widthMm) * BigInt(p.heightMm);
  const d = BigInt(divisor);
  return Number((volume + d - 1n) / d);
}

/** Billable weight = max(actual, volumetric). */
export function billableWeightG(p: Parcel, divisor = 6000): number {
  return Math.max(p.weightG, volumetricWeightG(p, divisor));
}

/** Multiply a single-item parcel by quantity. Volume scales linearly (stacked). */
export function scaleParcel(p: Parcel, quantity: number): Parcel {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new RangeError(`quantity must be a positive integer, got ${quantity}`);
  }
  return { ...p, weightG: p.weightG * quantity, heightMm: p.heightMm * quantity };
}

/** Billable weight is charged in 0.1 kg steps, rounded up. */
export function roundUpTo100g(g: number): number {
  assertNonNegInt(g, "g");
  return Math.ceil(g / 100) * 100;
}

/** Consolidated per-kg rate: forwarder subsequent-kg rate + HaloHaul spread. */
export function consolidatedRateFen(rate: Rate): Fen {
  return rate.subsequentKgFen + rate.spreadFen;
}

/**
 * Per-order shipping for a billable weight:
 *   max(minChargeSen, billable kg (rounded up to 0.1 kg) × consolidated rate)
 * No first-kg premium — orders share one consolidated forwarder parcel.
 * RMB is rounded up to a whole fen, then converted at `fxRate`.
 */
export function orderShippingCost(
  billableG: number,
  rate: Rate,
  fxRate: FxRateMicro,
): { chargedG: number; fen: Fen; sen: Sen } {
  const chargedG = roundUpTo100g(billableG);
  const fen = Math.ceil((chargedG * consolidatedRateFen(rate)) / 1000);
  const sen = Math.max(rate.minChargeSen, fenToSen(fen, fxRate));
  return { chargedG, fen, sen };
}

export interface ShippingEstimateInput {
  mode: ShippingMode;
  /** Per-item parcel. Seller-confirmed when known, else the category default. */
  parcel: Parcel;
  source: EstimateSource;
  quantity: number;
  fxRate: FxRateMicro;
  settings: Settings;
  forwarder?: string;
}

export interface ShippingEstimate {
  /** False for PDD direct-ship and digital orders: no forwarder leg. */
  applies: boolean;
  billableG: number;
  /** Billable weight used for the top of the range, after headroom. */
  billableMaxG: number;
  minFen: Fen;
  maxFen: Fen;
  minSen: Sen;
  maxSen: Sen;
}

const NO_SHIPPING: ShippingEstimate = {
  applies: false,
  billableG: 0,
  billableMaxG: 0,
  minFen: 0,
  maxFen: 0,
  minSen: 0,
  maxSen: 0,
};

/**
 * International shipping estimate as a range. The bottom of the range prices
 * the estimated billable weight; the top adds headroom that depends on how
 * trustworthy the estimate is (seller-confirmed vs. category default).
 */
export function estimateShipping(input: ShippingEstimateInput): ShippingEstimate {
  if (!isBatchShippingMode(input.mode)) return NO_SHIPPING;

  const forwarder = findForwarder(input.settings, input.forwarder);
  const rate = forwarder.rates[input.mode];
  if (!rate) {
    throw new Error(`Forwarder "${forwarder.name}" has no rate for mode "${input.mode}"`);
  }

  const parcel = scaleParcel(input.parcel, input.quantity);
  const billableG = billableWeightG(parcel, rate.volumetricDivisor);
  const headroom =
    input.source === "seller_confirmed"
      ? input.settings.shipping.rangeHeadroomPct.sellerConfirmed
      : input.settings.shipping.rangeHeadroomPct.categoryDefault;
  const billableMaxG = Math.ceil((billableG * (100 + headroom)) / 100);

  const min = orderShippingCost(billableG, rate, input.fxRate);
  const max = orderShippingCost(billableMaxG, rate, input.fxRate);
  return {
    applies: true,
    billableG,
    billableMaxG,
    minFen: min.fen,
    maxFen: max.fen,
    minSen: min.sen,
    maxSen: max.sen,
  };
}

/** Final (warehouse) shipping cost for one order, same rate table. */
export function finalShippingCost(input: {
  mode: ShippingMode;
  parcel: Parcel;
  fxRate: FxRateMicro;
  settings: Settings;
  forwarder?: string;
}): { billableG: number; fen: Fen; sen: Sen } {
  if (!isBatchShippingMode(input.mode)) return { billableG: 0, fen: 0, sen: 0 };
  const forwarder = findForwarder(input.settings, input.forwarder);
  const rate = forwarder.rates[input.mode];
  if (!rate) {
    throw new Error(`Forwarder "${forwarder.name}" has no rate for mode "${input.mode}"`);
  }
  const billableG = billableWeightG(input.parcel, rate.volumetricDivisor);
  const { fen, sen } = orderShippingCost(billableG, rate, input.fxRate);
  return { billableG, fen, sen };
}
