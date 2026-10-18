import { describe, expect, it } from "vitest";
import type { LedgerEntryType } from "./enums";
import { balanceOf, quoteCharges, reversalEntries } from "./ledger";

const quote = {
  id: "q1",
  itemPriceFen: 10000,
  itemPriceSen: 6500,
  fxRate: "0.650000",
  serviceFeeSen: 600,
  shippingEstimateMaxSen: 1200,
  deliveryFeeSen: 300,
  feeCreditSen: 400,
  feeType: "reverse_search_fee" as const,
};

describe("quoteCharges", () => {
  it("posts each component, shipping at the top of the range, and the fee credit", () => {
    const entries = quoteCharges(quote);
    expect(entries.map((e) => [e.type, e.amountSen])).toEqual([
      ["item_payment", 6500],
      ["service_fee", 600],
      ["shipping_estimate", 1200],
      ["delivery_fee", 300],
      ["reverse_search_fee", -400],
    ]);
    expect(entries[0]).toMatchObject({ sourceAmountFen: 10000, fxRate: "0.650000", reference: "quote:q1" });
    expect(balanceOf(entries).balanceSen).toBe(6500 + 600 + 1200 + 300 - 400);
  });

  it("skips zero components", () => {
    expect(quoteCharges({ ...quote, shippingEstimateMaxSen: 0, deliveryFeeSen: 0, feeCreditSen: 0 }).map((e) => e.type)).toEqual([
      "item_payment",
      "service_fee",
    ]);
  });
});

describe("reversalEntries", () => {
  it("refunds everything but the upfront fee as a credit", () => {
    const ledger: Array<{ type: LedgerEntryType; amountSen: number }> = [
      { type: "reverse_search_fee", amountSen: 400 }, // fee charged at submission
      { type: "payment", amountSen: -400 }, // fee paid
      ...quoteCharges(quote),
      { type: "payment", amountSen: -(6500 + 600 + 1200 + 300 - 400) }, // order paid
    ];
    expect(balanceOf(ledger).balanceSen).toBe(0);
    const reversal = reversalEntries(ledger, "cancel:1");
    expect(reversal.map((e) => [e.type, e.amountSen])).toEqual([
      ["item_payment", -6500],
      ["service_fee", -600],
      ["shipping_estimate", -1200],
      ["delivery_fee", -300],
      ["reverse_search_fee", 400],
    ]);
    // The student gets back everything they paid for the order itself; the RM4 search fee is kept.
    expect(balanceOf([...ledger, ...reversal]).creditSen).toBe(6500 + 600 + 1200 + 300 - 400 + 400 - 400);
  });

  it("leaves an unpaid order owing nothing", () => {
    const ledger = quoteCharges({ ...quote, feeCreditSen: 0 });
    expect(balanceOf([...ledger, ...reversalEntries(ledger, "x")]).balanceSen).toBe(0);
  });
});
