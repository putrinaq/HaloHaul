import { assertMinorUnits, percentOfFloor, type Sen } from "./money";

// Reconciliation after the warehouse weigh-in, relative to the quoted range:
//   within [min, max]  → no adjustment
//   above max          → charge (actual − max), capped at capPct% of max;
//                        the operator absorbs anything beyond the cap
//   below min          → credit (min − actual)

export type ReconciliationKind = "none" | "charge" | "credit";

export interface ReconciliationInput {
  quotedMinSen: Sen;
  quotedMaxSen: Sen;
  actualSen: Sen;
  /** Default 20 — the cap is configurable in settings. */
  capPct: number;
}

export interface ReconciliationResult {
  kind: ReconciliationKind;
  /**
   * Signed ledger amount for a `shipping_adjustment` entry:
   * positive = owed by the student, negative = credit, 0 = nothing to post.
   */
  ledgerAmountSen: Sen;
  /** Over-range amount the operator absorbs because of the cap. */
  absorbedSen: Sen;
  /** Sets `shipping_balance_due` on the order. */
  balanceDue: boolean;
  /** Sets `shipping_refund_due` on the order. */
  refundDue: boolean;
}

export function reconcileShipping(input: ReconciliationInput): ReconciliationResult {
  const { quotedMinSen: min, quotedMaxSen: max, actualSen: actual, capPct } = input;
  for (const [label, v] of [
    ["quotedMinSen", min],
    ["quotedMaxSen", max],
    ["actualSen", actual],
  ] as const) {
    assertMinorUnits(v, label);
    if (v < 0) throw new RangeError(`${label} must be ≥ 0`);
  }
  if (min > max) throw new RangeError("quotedMinSen must be ≤ quotedMaxSen");

  if (actual > max) {
    const cap = percentOfFloor(max, capPct);
    const over = actual - max;
    const charge = Math.min(over, cap);
    return {
      kind: charge > 0 ? "charge" : "none",
      ledgerAmountSen: charge,
      absorbedSen: over - charge,
      balanceDue: charge > 0,
      refundDue: false,
    };
  }

  if (actual < min) {
    const credit = min - actual;
    return {
      kind: "credit",
      ledgerAmountSen: -credit,
      absorbedSen: 0,
      balanceDue: false,
      refundDue: true,
    };
  }

  return { kind: "none", ledgerAmountSen: 0, absorbedSen: 0, balanceDue: false, refundDue: false };
}
