import { describe, expect, it } from "vitest";
import { reconcileShipping } from "./reconciliation";

const range = { quotedMinSen: 2_000, quotedMaxSen: 3_000, capPct: 20 };

describe("reconcileShipping", () => {
  it("does nothing inside the quoted range (inclusive)", () => {
    for (const actualSen of [2_000, 2_500, 3_000]) {
      expect(reconcileShipping({ ...range, actualSen })).toEqual({
        kind: "none",
        ledgerAmountSen: 0,
        absorbedSen: 0,
        balanceDue: false,
        refundDue: false,
      });
    }
  });

  it("charges the difference above the range when under the cap", () => {
    expect(reconcileShipping({ ...range, actualSen: 3_400 })).toEqual({
      kind: "charge",
      ledgerAmountSen: 400,
      absorbedSen: 0,
      balanceDue: true,
      refundDue: false,
    });
  });

  it("charges exactly the cap at +20%", () => {
    expect(reconcileShipping({ ...range, actualSen: 3_600 })).toMatchObject({
      ledgerAmountSen: 600,
      absorbedSen: 0,
    });
  });

  it("caps the charge at +20% of the top and the operator absorbs the rest", () => {
    expect(reconcileShipping({ ...range, actualSen: 5_000 })).toEqual({
      kind: "charge",
      ledgerAmountSen: 600,
      absorbedSen: 1_400,
      balanceDue: true,
      refundDue: false,
    });
  });

  it("rounds the cap down in the student's favour", () => {
    // 20% of 3,003 = 600.6 → 600
    const r = reconcileShipping({ quotedMinSen: 2_000, quotedMaxSen: 3_003, capPct: 20, actualSen: 9_999 });
    expect(r.ledgerAmountSen).toBe(600);
    expect(r.absorbedSen).toBe(9_999 - 3_003 - 600);
  });

  it("credits the difference below the range as a negative ledger amount", () => {
    expect(reconcileShipping({ ...range, actualSen: 1_250 })).toEqual({
      kind: "credit",
      ledgerAmountSen: -750,
      absorbedSen: 0,
      balanceDue: false,
      refundDue: true,
    });
  });

  it("credits the whole bottom of the range if nothing was billed", () => {
    expect(reconcileShipping({ ...range, actualSen: 0 }).ledgerAmountSen).toBe(-2_000);
  });

  it("absorbs everything when the cap is 0%", () => {
    const r = reconcileShipping({ ...range, capPct: 0, actualSen: 3_500 });
    expect(r).toMatchObject({ kind: "none", ledgerAmountSen: 0, absorbedSen: 500, balanceDue: false });
  });

  it("handles a zero-width range", () => {
    const r = reconcileShipping({ quotedMinSen: 1_000, quotedMaxSen: 1_000, capPct: 20, actualSen: 1_100 });
    expect(r.ledgerAmountSen).toBe(100);
  });

  it("rejects inverted ranges, negatives and floats", () => {
    expect(() => reconcileShipping({ quotedMinSen: 3_000, quotedMaxSen: 2_000, capPct: 20, actualSen: 1 })).toThrow();
    expect(() => reconcileShipping({ ...range, actualSen: -1 })).toThrow();
    expect(() => reconcileShipping({ ...range, actualSen: 10.5 })).toThrow();
  });
});
