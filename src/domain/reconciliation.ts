import { assertMinorUnits, percentOfFloor, type Sen } from "./money";

// Reconciliation after the warehouse weigh-in. The student pays the TOP of the
// quoted shipping range up front; we reconcile against what was actually paid:
//   actual < paid  → credit the full difference (to the customer's balance by
//                    default; cash refund on request)
//   actual > paid  → charge the difference, but never bring total shipping
//                    above max + capPct% of max; the operator absorbs the rest
//   actual = paid  → nothing

export type ReconciliationKind = "none" | "charge" | "credit";

export interface ReconciliationInput {
  /** Top of the quoted shipping range. */
  quotedMaxSen: Sen;
  /** Shipping actually collected for this order (normally = quotedMaxSen). */
  paidSen: Sen;
  /** Final shipping cost from the warehouse weigh-in. */
  actualSen: Sen;
  /** Default 20 — configurable in settings. */
  capPct: number;
}

export interface ReconciliationResult {
  kind: ReconciliationKind;
  /**
   * Signed amount for a `shipping_adjustment` ledger entry:
   * positive = owed by the student, negative = credit, 0 = nothing to post.
   */
  ledgerAmountSen: Sen;
  /** Over-cap amount the operator absorbs. */
  absorbedSen: Sen;
  /** Most the student can ever pay for shipping on this order. */
  capTotalSen: Sen;
  /** Sets `shipping_balance_due` — blocks release for pickup. */
  balanceDue: boolean;
  /** Sets `shipping_refund_due` — a credit was issued. */
  refundDue: boolean;
}

export function reconcileShipping(input: ReconciliationInput): ReconciliationResult {
  const { quotedMaxSen: max, paidSen: paid, actualSen: actual, capPct } = input;
  for (const [label, v] of [
    ["quotedMaxSen", max],
    ["paidSen", paid],
    ["actualSen", actual],
  ] as const) {
    assertMinorUnits(v, label);
    if (v < 0) throw new RangeError(`${label} must be ≥ 0`);
  }

  const capTotalSen = max + percentOfFloor(max, capPct);
  const none = { absorbedSen: 0, capTotalSen, balanceDue: false, refundDue: false };

  if (actual < paid) {
    return { ...none, kind: "credit", ledgerAmountSen: -(paid - actual), refundDue: true };
  }

  if (actual > paid) {
    const charge = Math.max(0, Math.min(actual, capTotalSen) - paid);
    return {
      kind: charge > 0 ? "charge" : "none",
      ledgerAmountSen: charge,
      absorbedSen: actual - paid - charge,
      capTotalSen,
      balanceDue: charge > 0,
      refundDue: false,
    };
  }

  return { ...none, kind: "none", ledgerAmountSen: 0 };
}
