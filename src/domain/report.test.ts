import { describe, expect, it } from "vitest";
import type { ShippingChoiceSnapshot } from "./analytics";
import { speedVsPrice, timeInStatus, toCsv } from "./report";

const snap = (chosen: string): ShippingChoiceSnapshot =>
  ({
    chosen,
    category: "clothing_top",
    capturedAt: "2026-10-01T00:00:00Z",
    options: [
      { mode: "air", minSen: 1500, maxSen: 2000, etaDaysMin: 10, etaDaysMax: 14 },
      { mode: "sea", minSen: 600, maxSen: 900, etaDaysMin: 25, etaDaysMax: 35 },
    ],
  }) as ShippingChoiceSnapshot;

describe("speedVsPrice", () => {
  it("counts cheapest/fastest picks and the price paid for speed", () => {
    const rows = speedVsPrice([snap("air"), snap("air"), snap("sea")]);
    expect(rows).toEqual([
      { mode: "air", orders: 2, choseCheapest: 0, choseFastest: 2, avgExtraSen: 1100, avgDaysSaved: 21 },
      { mode: "sea", orders: 1, choseCheapest: 1, choseFastest: 0, avgExtraSen: 0, avgDaysSaved: 0 },
    ]);
  });

  it("ignores orders with no real choice", () => {
    const single = { ...snap("air"), options: [snap("air").options[0]] } as ShippingChoiceSnapshot;
    expect(speedVsPrice([single])).toEqual([]);
  });
});

describe("timeInStatus", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 1) + h * 3_600_000);
  it("averages completed stays and skips notes and the current status", () => {
    const rows = timeInStatus([
      { orderId: 1, fromStatus: null, toStatus: "submitted", at: t(0) },
      { orderId: 1, fromStatus: "submitted", toStatus: "submitted", at: t(1) }, // note
      { orderId: 1, fromStatus: "submitted", toStatus: "quote_sent", at: t(10) },
      { orderId: 1, fromStatus: "quote_sent", toStatus: "awaiting_payment", at: t(34) },
      { orderId: 2, fromStatus: null, toStatus: "submitted", at: t(0) },
      { orderId: 2, fromStatus: "submitted", toStatus: "quote_sent", at: t(30) },
    ]);
    expect(rows).toEqual([
      { status: "quote_sent", samples: 1, avgHours: 24, medianHours: 24 },
      { status: "submitted", samples: 2, avgHours: 20, medianHours: 20 },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes where needed and defuses formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], ["=SUM(A1)", -5], [null, "@cmd"]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),-5\r\n,\'@cmd\r\n');
  });
});
