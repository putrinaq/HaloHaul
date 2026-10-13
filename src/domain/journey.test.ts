import { describe, expect, it } from "vitest";
import { journeyFor, journeyProgress } from "./journey";
import { balanceOf } from "./ledger";
import { ORDER_STATUSES } from "./enums";

const states = (s: Parameters<typeof journeyProgress>[0], mode: Parameters<typeof journeyProgress>[1], reached?: Parameters<typeof journeyProgress>[2]) =>
  journeyProgress(s, mode, reached).map((m) => `${m.key}:${m.state}`);

describe("journey", () => {
  it("has mode-specific milestones", () => {
    expect(journeyFor("air").map((m) => m.key)).toEqual(["request", "quote", "bought", "warehouse", "shipped", "pickup", "done"]);
    expect(journeyFor("pdd_direct").map((m) => m.key)).toEqual(["request", "quote", "bought", "arrived", "pickup", "done"]);
    expect(journeyFor("none").map((m) => m.key)).toEqual(["request", "quote", "bought", "done"]);
  });

  it("maps every non-terminal status onto a batch-mode milestone", () => {
    const covered = new Set(journeyFor("air").flatMap((m) => m.statuses));
    for (const s of ORDER_STATUSES) {
      if (s === "rejected" || s === "cancelled") continue;
      expect(covered.has(s), s).toBe(true);
    }
  });

  it("marks done / current / upcoming", () => {
    expect(states("qc_review", "air")).toEqual([
      "request:done", "quote:done", "bought:done", "warehouse:current", "shipped:upcoming", "pickup:upcoming", "done:upcoming",
    ]);
    expect(states("completed", "sea").every((s) => s.endsWith(":done"))).toBe(true);
  });

  it("stops at the last reached step for cancelled orders", () => {
    expect(states("cancelled", "air", ["submitted", "quote_sent"])).toEqual([
      "request:done", "quote:done", "bought:upcoming", "warehouse:upcoming", "shipped:upcoming", "pickup:upcoming", "done:upcoming",
    ]);
  });
});

describe("balanceOf", () => {
  it("splits a signed ledger into owed and credit", () => {
    expect(balanceOf([])).toEqual({ balanceSen: 0, owedSen: 0, creditSen: 0 });
    expect(balanceOf([{ amountSen: 1_000 }, { amountSen: -400 }])).toEqual({ balanceSen: 600, owedSen: 600, creditSen: 0 });
    expect(balanceOf([{ amountSen: 1_000 }, { amountSen: -1_500 }])).toEqual({ balanceSen: -500, owedSen: 0, creditSen: 500 });
  });
});
