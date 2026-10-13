import type { OrderStatus, ShippingMode } from "./enums";
import { ORDER_STATUSES } from "./enums";

// The single source of truth for order status changes. Route handlers and the
// worker must call `assertTransition` before writing a new status; the DB layer
// records every change in `order_status_history`.

export type Actor = "student" | "admin" | "system";

export interface TransitionContext {
  actor: Actor;
  shippingMode: ShippingMode;
  /** Order has a restricted-item match that an admin has not cleared yet. */
  restrictedHold?: boolean;
  /** `shipping_balance_due` flag from reconciliation. */
  shippingBalanceDue?: boolean;
}

interface Rule {
  to: OrderStatus;
  actors: readonly Actor[];
  /** If set, the transition only exists for these shipping modes. */
  onlyModes?: readonly ShippingMode[];
}

const ADMIN = ["admin"] as const;
const ADMIN_SYSTEM = ["admin", "system"] as const;
const ANYONE = ["student", "admin", "system"] as const;
const BATCH_MODES = ["air", "air_sensitive", "sea"] as const;

/** States before payment is confirmed — cancellable without a refund. */
export const PRE_PAYMENT_STATUSES = [
  "submitted",
  "needs_info",
  "sourcing",
  "quote_sent",
  "awaiting_payment",
] as const satisfies readonly OrderStatus[];

export const TERMINAL_STATUSES = [
  "completed",
  "rejected",
  "cancelled",
] as const satisfies readonly OrderStatus[];

const cancel: Rule = { to: "cancelled", actors: ANYONE };

const TRANSITIONS: Record<OrderStatus, readonly Rule[]> = {
  submitted: [
    { to: "needs_info", actors: ADMIN },
    { to: "sourcing", actors: ADMIN },
    { to: "quote_sent", actors: ADMIN },
    { to: "rejected", actors: ADMIN },
    cancel,
  ],
  needs_info: [{ to: "submitted", actors: ["student", "admin"] }, cancel],
  sourcing: [
    { to: "quote_sent", actors: ADMIN },
    { to: "rejected", actors: ADMIN },
    cancel,
  ],
  // Student accepts (→ awaiting_payment) or declines (→ cancelled); the worker
  // cancels expired quotes.
  quote_sent: [{ to: "awaiting_payment", actors: ["student", "admin"] }, cancel],
  awaiting_payment: [{ to: "paid", actors: ADMIN_SYSTEM }, cancel],
  paid: [{ to: "order_submitted", actors: ADMIN }],
  order_submitted: [
    { to: "at_warehouse", actors: ADMIN, onlyModes: BATCH_MODES },
    // PDD direct-ship: no forwarder leg, PDD ships straight to Malaysia.
    { to: "shipped", actors: ADMIN, onlyModes: ["pdd_direct"] },
    // Digital products are delivered by email, nothing to ship.
    { to: "completed", actors: ADMIN, onlyModes: ["none"] },
  ],
  at_warehouse: [{ to: "qc_review", actors: ADMIN }],
  qc_review: [
    { to: "ready_to_consolidate", actors: ADMIN },
    { to: "rejected", actors: ADMIN }, // refund path
  ],
  ready_to_consolidate: [{ to: "consolidated", actors: ADMIN_SYSTEM }],
  consolidated: [{ to: "shipped", actors: ADMIN }],
  shipped: [{ to: "arrived_my", actors: ADMIN }],
  arrived_my: [{ to: "ready_for_pickup", actors: ADMIN }],
  ready_for_pickup: [{ to: "completed", actors: ADMIN }],
  completed: [],
  rejected: [],
  cancelled: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly reason: string,
  ) {
    super(`Cannot move order from ${from} to ${to}: ${reason}`);
    this.name = "InvalidTransitionError";
  }
}

/** Returns null if allowed, otherwise the reason it is not. */
export function transitionBlocker(
  from: OrderStatus,
  to: OrderStatus,
  ctx: TransitionContext,
): string | null {
  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) return "no such transition";
  if (rule.onlyModes && !rule.onlyModes.includes(ctx.shippingMode)) {
    return `not available for shipping mode ${ctx.shippingMode}`;
  }
  if (!rule.actors.includes(ctx.actor)) return `${ctx.actor} may not perform this transition`;
  if (to === "quote_sent" && ctx.restrictedHold) {
    return "order is held for restricted-item review";
  }
  if ((to === "ready_for_pickup" || to === "completed") && ctx.shippingBalanceDue) {
    return "a shipping balance is still owed";
  }
  return null;
}

export function canTransition(from: OrderStatus, to: OrderStatus, ctx: TransitionContext): boolean {
  return transitionBlocker(from, to, ctx) === null;
}

export function assertTransition(from: OrderStatus, to: OrderStatus, ctx: TransitionContext): void {
  const reason = transitionBlocker(from, to, ctx);
  if (reason) throw new InvalidTransitionError(from, to, reason);
}

/** Statuses reachable from `from` for this actor/order right now. */
export function allowedTransitions(from: OrderStatus, ctx: TransitionContext): OrderStatus[] {
  return TRANSITIONS[from].map((r) => r.to).filter((to) => canTransition(from, to, ctx));
}

export function isTerminal(status: OrderStatus): boolean {
  return (TERMINAL_STATUSES as readonly OrderStatus[]).includes(status);
}

export function isPrePayment(status: OrderStatus): boolean {
  return (PRE_PAYMENT_STATUSES as readonly OrderStatus[]).includes(status);
}

/** Cancellation through the UI is free and allowed only before payment. */
export function isCancellableByStudent(status: OrderStatus): boolean {
  return isPrePayment(status);
}

/** Every (from, to) edge regardless of context — used by tests and docs. */
export function allEdges(): Array<[OrderStatus, OrderStatus]> {
  return ORDER_STATUSES.flatMap((from) =>
    TRANSITIONS[from].map((r) => [from, r.to] as [OrderStatus, OrderStatus]),
  );
}
