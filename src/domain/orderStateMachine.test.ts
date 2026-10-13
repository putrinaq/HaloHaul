import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, type OrderStatus } from "./enums";
import {
  allEdges,
  allowedTransitions,
  assertTransition,
  canTransition,
  cancellationNeedsRefund,
  InvalidTransitionError,
  isCancellableByStudent,
  isTerminal,
  PRE_PAYMENT_STATUSES,
  TERMINAL_STATUSES,
  type TransitionContext,
} from "./orderStateMachine";

const admin: TransitionContext = { actor: "admin", shippingMode: "air" };
const student: TransitionContext = { actor: "student", shippingMode: "air" };
const system: TransitionContext = { actor: "system", shippingMode: "air" };

describe("transition map", () => {
  it("contains exactly the agreed edges", () => {
    const expected = new Set([
      "submitted>needs_info", "submitted>sourcing", "submitted>quote_sent", "submitted>rejected",
      "needs_info>submitted",
      "sourcing>quote_sent", "sourcing>rejected",
      "quote_sent>awaiting_payment",
      "awaiting_payment>paid",
      "paid>order_submitted",
      "order_submitted>at_warehouse",
      "at_warehouse>qc_review",
      "qc_review>ready_to_consolidate", "qc_review>rejected",
      "ready_to_consolidate>consolidated",
      "consolidated>shipped", "shipped>arrived_my", "arrived_my>ready_for_pickup",
      "ready_for_pickup>completed",
      // any pre-payment state → cancelled, and paid → cancelled (with refund)
      ...PRE_PAYMENT_STATUSES.map((s) => `${s}>cancelled`),
      "paid>cancelled",
      // mode-specific: PDD direct-ship and digital
      "order_submitted>arrived_my", "order_submitted>completed",
    ]);
    const actual = new Set(allEdges().map(([a, b]) => `${a}>${b}`));
    expect(actual).toEqual(expected);
  });

  it("has no transitions out of terminal states", () => {
    for (const s of TERMINAL_STATUSES) {
      expect(isTerminal(s)).toBe(true);
      for (const actor of ["student", "admin", "system"] as const) {
        expect(allowedTransitions(s, { actor, shippingMode: "air" })).toEqual([]);
      }
    }
  });

  it("can reach completed from submitted along the happy path", () => {
    const path: OrderStatus[] = [
      "submitted", "sourcing", "quote_sent", "awaiting_payment", "paid", "order_submitted",
      "at_warehouse", "qc_review", "ready_to_consolidate", "consolidated", "shipped",
      "arrived_my", "ready_for_pickup", "completed",
    ];
    for (let i = 1; i < path.length; i++) {
      const ctx = path[i] === "awaiting_payment" ? student : admin;
      expect(() => assertTransition(path[i - 1], path[i], ctx)).not.toThrow();
    }
  });

  it("every status is reachable from submitted", () => {
    const seen = new Set<OrderStatus>(["submitted"]);
    const queue: OrderStatus[] = ["submitted"];
    const edges = allEdges();
    while (queue.length) {
      const from = queue.shift()!;
      for (const [a, b] of edges) if (a === from && !seen.has(b)) { seen.add(b); queue.push(b); }
    }
    expect([...seen].sort()).toEqual([...ORDER_STATUSES].sort());
  });
});

describe("invalid transitions are impossible", () => {
  it("rejects skipping steps and going backwards", () => {
    const bad: Array<[OrderStatus, OrderStatus]> = [
      ["submitted", "paid"],
      ["quote_sent", "paid"],
      ["paid", "shipped"],
      ["at_warehouse", "ready_to_consolidate"],
      ["shipped", "consolidated"],
      ["completed", "submitted"],
      ["cancelled", "submitted"],
      ["submitted", "submitted"],
    ];
    for (const [from, to] of bad) {
      expect(canTransition(from, to, admin), `${from}→${to}`).toBe(false);
      expect(() => assertTransition(from, to, admin)).toThrow(InvalidTransitionError);
    }
  });

  it("explains why a transition was refused", () => {
    try {
      assertTransition("paid", "shipped", admin);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).reason).toBe("no such transition");
    }
  });
});

describe("cancellation", () => {
  it("is free for students in every pre-payment state", () => {
    for (const s of PRE_PAYMENT_STATUSES) {
      expect(isCancellableByStudent(s)).toBe(true);
      expect(canTransition(s, "cancelled", student)).toBe(true);
    }
  });

  it("is allowed at paid, with a full refund", () => {
    expect(isCancellableByStudent("paid")).toBe(true);
    expect(canTransition("paid", "cancelled", student)).toBe(true);
    expect(canTransition("paid", "cancelled", admin)).toBe(true);
    expect(cancellationNeedsRefund("paid")).toBe(true);
    for (const s of PRE_PAYMENT_STATUSES) expect(cancellationNeedsRefund(s)).toBe(false);
  });

  it("is never automatic once paid", () => {
    expect(canTransition("paid", "cancelled", system)).toBe(false);
  });

  it("is impossible from order_submitted onwards", () => {
    const after: OrderStatus[] = ["order_submitted", "at_warehouse", "qc_review", "shipped", "ready_for_pickup"];
    for (const s of after) {
      expect(isCancellableByStudent(s)).toBe(false);
      expect(canTransition(s, "cancelled", student)).toBe(false);
      expect(canTransition(s, "cancelled", admin)).toBe(false);
    }
  });

  it("lets the worker cancel expired quotes and unpaid orders", () => {
    expect(canTransition("quote_sent", "cancelled", system)).toBe(true);
    expect(canTransition("awaiting_payment", "cancelled", system)).toBe(true);
  });
});

describe("actor permissions", () => {
  it("only lets students resubmit info, accept quotes and cancel", () => {
    expect(allowedTransitions("needs_info", student).sort()).toEqual(["cancelled", "submitted"]);
    expect(allowedTransitions("quote_sent", student).sort()).toEqual(["awaiting_payment", "cancelled"]);
    expect(allowedTransitions("submitted", student)).toEqual(["cancelled"]);
    expect(allowedTransitions("awaiting_payment", student)).toEqual(["cancelled"]);
    expect(allowedTransitions("qc_review", student)).toEqual([]);
  });

  it("never lets a student confirm their own payment", () => {
    expect(canTransition("awaiting_payment", "paid", student)).toBe(false);
    expect(canTransition("awaiting_payment", "paid", admin)).toBe(true);
    expect(canTransition("awaiting_payment", "paid", system)).toBe(true); // Fiuu callback
  });

  it("lets the worker consolidate on batch lock", () => {
    expect(canTransition("ready_to_consolidate", "consolidated", system)).toBe(true);
  });
});

describe("guards", () => {
  it("holds restricted orders before any quote goes out", () => {
    const held = { ...admin, restrictedHold: true };
    expect(canTransition("submitted", "quote_sent", held)).toBe(false);
    expect(canTransition("sourcing", "quote_sent", held)).toBe(false);
    // review can still progress the order in other ways
    expect(canTransition("submitted", "sourcing", held)).toBe(true);
    expect(canTransition("submitted", "rejected", held)).toBe(true);
  });

  it("blocks release for pickup while a shipping balance is owed", () => {
    const owing = { ...admin, shippingBalanceDue: true };
    expect(canTransition("arrived_my", "ready_for_pickup", owing)).toBe(false);
    expect(canTransition("ready_for_pickup", "completed", owing)).toBe(false);
    expect(canTransition("arrived_my", "ready_for_pickup", admin)).toBe(true);
  });
});

describe("shipping-mode specific paths", () => {
  it("sends batch modes through the warehouse", () => {
    for (const shippingMode of ["air", "air_sensitive", "sea"] as const) {
      const ctx = { actor: "admin" as const, shippingMode };
      expect(allowedTransitions("order_submitted", ctx)).toEqual(["at_warehouse"]);
    }
  });

  it("sends PDD direct-ship to the operator, then campus pickup — no warehouse, QC or batch", () => {
    const ctx = { actor: "admin" as const, shippingMode: "pdd_direct" as const };
    expect(allowedTransitions("order_submitted", ctx)).toEqual(["arrived_my"]);
    const path: OrderStatus[] = ["order_submitted", "arrived_my", "ready_for_pickup", "completed"];
    for (let i = 1; i < path.length; i++) {
      expect(() => assertTransition(path[i - 1], path[i], ctx)).not.toThrow();
    }
    expect(canTransition("order_submitted", "at_warehouse", ctx)).toBe(false);
    expect(canTransition("order_submitted", "shipped", ctx)).toBe(false);
  });

  it("does not let batch modes skip straight to arrived", () => {
    expect(canTransition("order_submitted", "arrived_my", admin)).toBe(false);
  });

  it("completes digital orders straight after purchase", () => {
    const ctx = { actor: "admin" as const, shippingMode: "none" as const };
    expect(allowedTransitions("order_submitted", ctx)).toEqual(["completed"]);
  });
});
