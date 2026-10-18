import { describe, expect, it } from "vitest";
import { ACTION_FILTERS, matchesFilter, nextAdminAction, paymentState, waiting, type QueueOrder } from "./adminQueue";
import { ORDER_STATUSES, PATH_TYPES, SHIPPING_MODES } from "./enums";
import { canTransition } from "./orderStateMachine";

const base: QueueOrder = {
  status: "submitted",
  pathType: "url",
  shippingMode: "air",
  restrictedFlag: false,
  restrictedClearedAt: null,
  shippingBalanceDue: false,
  shippingRefundDue: false,
  feePaidAt: null,
  optionsSentAt: null,
  optionCount: 0,
  hasSelectedOption: false,
  batchId: null,
  pendingPayments: [],
};
const o = (over: Partial<QueueOrder>): QueueOrder => ({ ...base, ...over });
const paid = new Date("2026-10-01T00:00:00Z");

describe("nextAdminAction", () => {
  it("only offers one-tap changes the state machine allows for an admin", () => {
    for (const status of ORDER_STATUSES)
      for (const shippingMode of SHIPPING_MODES)
        for (const pathType of PATH_TYPES)
          for (const shippingBalanceDue of [false, true]) {
            const order = o({ status, shippingMode, pathType, shippingBalanceDue, feePaidAt: paid });
            const action = nextAdminAction(order);
            if (action?.kind !== "advance") continue;
            expect(
              canTransition(status, action.to, { actor: "admin", shippingMode, shippingBalanceDue }),
              `${status} → ${action.to} (${shippingMode})`,
            ).toBe(true);
          }
  });

  it("follows the brief's examples", () => {
    const label = (over: Partial<QueueOrder>) => nextAdminAction(o(over))?.label;
    expect(label({ pathType: "url" })).toBe("Send quote");
    expect(label({ pathType: "reverse_search" })).toBe("Mark fee paid");
    expect(label({ pathType: "consultation", pendingPayments: ["upfront_fee"] })).toBe("Confirm payment");
    expect(label({ pathType: "reverse_search", feePaidAt: paid })).toBe("Add options");
    expect(label({ status: "sourcing", pathType: "reverse_search", feePaidAt: paid })).toBe("Add options");
    expect(label({ status: "awaiting_payment", pendingPayments: ["order"] })).toBe("Confirm payment");
    expect(label({ status: "paid" })).toBe("Mark bought");
    expect(label({ status: "at_warehouse" })).toBe("Record QC");
    expect(label({ status: "qc_review" })).toBe("Approve QC");
    expect(label({ status: "ready_to_consolidate" })).toBe("Add to batch");
    expect(label({ status: "arrived_my" })).toBe("Ready for pickup");
    expect(label({ status: "shipped", shippingRefundDue: true })).toBe("Issue refund/credit");
  });

  it("opens a drawer for anything that needs input", () => {
    expect(nextAdminAction(o({}))).toEqual({ kind: "dialog", label: "Send quote", dialog: "quote" });
    expect(nextAdminAction(o({ status: "at_warehouse" }))).toEqual({ kind: "dialog", label: "Record QC", dialog: "qc" });
  });

  it("waits for the student once options are out, then quotes the one they picked", () => {
    const sent = { status: "sourcing" as const, pathType: "reverse_search" as const, feePaidAt: paid, optionsSentAt: paid, optionCount: 3 };
    expect(nextAdminAction(o(sent))).toBeNull();
    expect(nextAdminAction(o({ ...sent, hasSelectedOption: true }))?.label).toBe("Send quote");
  });

  it("holds restricted items for review until they are cleared", () => {
    expect(nextAdminAction(o({ restrictedFlag: true }))).toEqual({ kind: "dialog", label: "Review restricted item", dialog: "restricted" });
    expect(nextAdminAction(o({ restrictedFlag: true, restrictedClearedAt: new Date() }))?.label).toBe("Send quote");
  });

  it("leaves orders that wait on the student, seller or batch off the board", () => {
    for (const status of ["needs_info", "quote_sent", "consolidated", "shipped", "completed", "cancelled"] as const) {
      expect(nextAdminAction(o({ status })), status).toBeNull();
    }
    expect(nextAdminAction(o({ status: "awaiting_payment" }))).toBeNull();
    expect(nextAdminAction(o({ status: "ready_to_consolidate", batchId: "b1" }))).toBeNull();
  });

  it("picks the next step by shipping mode once bought", () => {
    expect(nextAdminAction(o({ status: "order_submitted" }))).toMatchObject({ to: "at_warehouse" });
    expect(nextAdminAction(o({ status: "order_submitted", shippingMode: "pdd_direct" }))).toMatchObject({ to: "arrived_my" });
    expect(nextAdminAction(o({ status: "order_submitted", shippingMode: "none" }))).toMatchObject({ to: "completed" });
  });

  it("won't release a parcel while a shipping balance is owed", () => {
    expect(nextAdminAction(o({ status: "arrived_my", shippingBalanceDue: true }))).toEqual({ kind: "dialog", label: "Collect balance", dialog: "balance" });
    expect(nextAdminAction(o({ status: "arrived_my", shippingBalanceDue: true, pendingPayments: ["balance"] }))?.label).toBe("Confirm payment");
  });
});

describe("paymentState", () => {
  it("prefers what needs doing over the plain status", () => {
    expect(paymentState(o({ status: "awaiting_payment", pendingPayments: ["order"] })).label).toBe("Proof uploaded");
    expect(paymentState(o({ status: "shipped", shippingRefundDue: true })).label).toBe("Refund due");
    expect(paymentState(o({ status: "qc_review" })).label).toBe("Paid");
    expect(paymentState(o({})).label).toBe("Not quoted");
    expect(paymentState(o({ pathType: "reverse_search" })).label).toBe("Fee unpaid");
    expect(paymentState(o({ pathType: "reverse_search", feePaidAt: paid })).label).toBe("Fee paid");
  });
});

describe("matchesFilter", () => {
  it("splits new requests by path; the rest match status or flag", () => {
    expect(matchesFilter(o({ pathType: "consultation" }), "consultation")).toBe(true);
    expect(matchesFilter(o({ pathType: "consultation", status: "sourcing" }), "consultation")).toBe(true);
    expect(matchesFilter(o({ pathType: "consultation", status: "paid" }), "consultation")).toBe(false);
    expect(matchesFilter(o({ status: "qc_review" }), "qc_review")).toBe(true);
    expect(matchesFilter(o({ status: "shipped", shippingRefundDue: true }), "shipping_refund")).toBe(true);
    for (const f of ACTION_FILTERS) expect(typeof matchesFilter(base, f.key)).toBe("boolean");
  });
});

describe("waiting", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("rounds down and escalates after two and four days", () => {
    expect(waiting(ago(30_000), now)).toEqual({ label: "just now", level: 0 });
    expect(waiting(ago(5 * 60_000), now)).toEqual({ label: "waiting 5m", level: 0 });
    expect(waiting(ago(3 * 3_600_000), now)).toEqual({ label: "waiting 3h", level: 0 });
    expect(waiting(ago(2.5 * 86_400_000), now)).toEqual({ label: "waiting 2d", level: 1 });
    expect(waiting(ago(5 * 86_400_000), now)).toEqual({ label: "waiting 5d", level: 2 });
  });
});
