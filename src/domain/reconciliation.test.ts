import { describe, expect, it } from "vitest";
import { reconcileShipping } from "./reconciliation";

// Quoted range RM20–RM30; the student paid the max (RM30) up front.
const base = { quotedMaxSen: 3_000, paidSen: 3_000, capPct: 20 };

describe("reconcileShipping", () => {
  it("does nothing when the actual cost equals what was paid", () => {
    expect(reconcileShipping({ ...base, actualSen: 3_000 })).toEqual({
      kind: "none",
      ledgerAmountSen: 0,
      absorbedSen: 0,
      capTotalSen: 3_600,
      balanceDue: false,
      refundDue: false,
    });
  });

  it("credits the full difference when the actual is below what was paid — even inside the range", () => {
    expect(reconcileShipping({ ...base, actualSen: 2_500 })).toEqual({
      kind: "credit",
      ledgerAmountSen: -500,
      absorbedSen: 0,
      capTotalSen: 3_600,
      balanceDue: false,
      refundDue: true,
    });
  });

  it("credits below the bottom of the range against what was paid, not the range", () => {
    expect(reconcileShipping({ ...base, actualSen: 1_250 }).ledgerAmountSen).toBe(-1_750);
  });

  it("credits everything paid if shipping turned out free", () => {
    expect(reconcileShipping({ ...base, actualSen: 0 }).ledgerAmountSen).toBe(-3_000);
  });

  it("charges the difference above what was paid when under the cap", () => {
    expect(reconcileShipping({ ...base, actualSen: 3_400 })).toEqual({
      kind: "charge",
      ledgerAmountSen: 400,
      absorbedSen: 0,
      capTotalSen: 3_600,
      balanceDue: true,
      refundDue: false,
    });
  });

  it("charges exactly up to +20% over the max", () => {
    expect(reconcileShipping({ ...base, actualSen: 3_600 })).toMatchObject({
      ledgerAmountSen: 600,
      absorbedSen: 0,
    });
  });

  it("caps at +20% over the max and the operator absorbs the rest", () => {
    expect(reconcileShipping({ ...base, actualSen: 5_000 })).toEqual({
      kind: "charge",
      ledgerAmountSen: 600,
      absorbedSen: 1_400,
      capTotalSen: 3_600,
      balanceDue: true,
      refundDue: false,
    });
  });

  it("measures the cap from the max even if less than the max was paid", () => {
    // Paid RM25 against a RM30 max; cap total is RM36 → at most RM11 more.
    const r = reconcileShipping({ ...base, paidSen: 2_500, actualSen: 9_000 });
    expect(r.ledgerAmountSen).toBe(1_100);
    expect(r.absorbedSen).toBe(9_000 - 2_500 - 1_100);
  });

  it("never charges when more than the cap was already paid", () => {
    const r = reconcileShipping({ ...base, paidSen: 4_000, actualSen: 4_500 });
    expect(r).toMatchObject({ kind: "none", ledgerAmountSen: 0, absorbedSen: 500, balanceDue: false });
  });

  it("rounds the cap down in the student's favour", () => {
    // 20% of 3,003 = 600.6 → 600
    const r = reconcileShipping({ quotedMaxSen: 3_003, paidSen: 3_003, capPct: 20, actualSen: 9_999 });
    expect(r.capTotalSen).toBe(3_603);
    expect(r.ledgerAmountSen).toBe(600);
  });

  it("absorbs every overrun when the cap is 0%", () => {
    const r = reconcileShipping({ ...base, capPct: 0, actualSen: 3_500 });
    expect(r).toMatchObject({ kind: "none", ledgerAmountSen: 0, absorbedSen: 500, balanceDue: false });
  });

  it("rejects negatives and floats", () => {
    expect(() => reconcileShipping({ ...base, actualSen: -1 })).toThrow();
    expect(() => reconcileShipping({ ...base, paidSen: -1, actualSen: 1 })).toThrow();
    expect(() => reconcileShipping({ ...base, actualSen: 10.5 })).toThrow();
  });
});
