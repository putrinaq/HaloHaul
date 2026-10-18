import type { LedgerEntryType } from "./enums";
import { sumMinor, type Fen, type Sen } from "./money";

export interface Balance {
  /** Positive = the student owes this; negative = credit in the student's favour. */
  balanceSen: Sen;
  owedSen: Sen;
  creditSen: Sen;
}

/** Ledger entries are signed: positive = owed by the student, negative = credit. */
export function balanceOf(entries: ReadonlyArray<{ amountSen: number }>): Balance {
  const balanceSen = sumMinor(entries.map((e) => e.amountSen));
  return {
    balanceSen,
    owedSen: Math.max(0, balanceSen),
    creditSen: Math.max(0, -balanceSen),
  };
}

export interface NewLedgerEntry {
  type: LedgerEntryType;
  amountSen: Sen;
  sourceAmountFen?: Fen;
  /** Decimal string, numeric(12,6). */
  fxRate?: string;
  reference: string;
}

export const UPFRONT_FEE_TYPES = ["reverse_search_fee", "consultation_fee"] as const satisfies readonly LedgerEntryType[];

/**
 * Charges posted when the student accepts a quote: every component separately,
 * shipping at the top of the range (reconciled after the weigh-in), and the
 * upfront search/consultation fee credited back as a negative fee entry.
 */
export function quoteCharges(quote: {
  id: string;
  itemPriceFen: Fen;
  itemPriceSen: Sen;
  fxRate: string;
  serviceFeeSen: Sen;
  shippingEstimateMaxSen: Sen;
  deliveryFeeSen: Sen;
  feeCreditSen: Sen;
  feeType?: (typeof UPFRONT_FEE_TYPES)[number] | null;
}): NewLedgerEntry[] {
  const reference = `quote:${quote.id}`;
  const out: NewLedgerEntry[] = [];
  if (quote.itemPriceSen > 0)
    out.push({ type: "item_payment", amountSen: quote.itemPriceSen, sourceAmountFen: quote.itemPriceFen, fxRate: quote.fxRate, reference });
  if (quote.serviceFeeSen > 0) out.push({ type: "service_fee", amountSen: quote.serviceFeeSen, reference });
  if (quote.shippingEstimateMaxSen > 0) out.push({ type: "shipping_estimate", amountSen: quote.shippingEstimateMaxSen, reference });
  if (quote.deliveryFeeSen > 0) out.push({ type: "delivery_fee", amountSen: quote.deliveryFeeSen, reference });
  if (quote.feeCreditSen > 0 && quote.feeType) out.push({ type: quote.feeType, amountSen: -quote.feeCreditSen, reference: `${reference}:fee-credit` });
  return out;
}

/** Entries that record money moving, never reversed by a cancellation. */
const MONEY_MOVEMENTS: readonly LedgerEntryType[] = ["payment", "payout", "refund"];

/**
 * Reversal for a cancelled or rejected order: every charge (and fee credit) is
 * undone per type, except money that actually moved and the original upfront
 * fee, which is kept (brief: the search fee isn't refunded if nothing is
 * bought). What's left is the student's credit.
 */
export function reversalEntries(entries: ReadonlyArray<{ type: LedgerEntryType; amountSen: Sen }>, reference: string): NewLedgerEntry[] {
  const totals = new Map<LedgerEntryType, number>();
  for (const e of entries) {
    if (MONEY_MOVEMENTS.includes(e.type)) continue;
    // The upfront fee charge itself (positive) stays; its credit (negative) is undone.
    if ((UPFRONT_FEE_TYPES as readonly string[]).includes(e.type) && e.amountSen > 0) continue;
    totals.set(e.type, (totals.get(e.type) ?? 0) + e.amountSen);
  }
  return [...totals]
    .filter(([, sum]) => sum !== 0)
    .map(([type, sum]) => ({ type, amountSen: -sum, reference }));
}
