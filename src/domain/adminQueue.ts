import type { OrderStatus, PathType, PaymentPurpose, ShippingMode } from "./enums";
import { canTransition } from "./orderStateMachine";

// The admin "Need Action" board: which orders are waiting on the admin, and
// the one primary action each card offers. Every one-tap action is a status
// change the state machine allows for an admin (see adminQueue.test.ts);
// everything that needs input opens a drawer in place.

export interface QueueOrder {
  status: OrderStatus;
  pathType: PathType;
  shippingMode: ShippingMode;
  restrictedFlag: boolean;
  restrictedClearedAt: Date | null;
  shippingBalanceDue: boolean;
  /** A credit is owed to the student (shipping reconciliation, or a cancelled/rejected paid order). */
  shippingRefundDue: boolean;
  /** Upfront reverse-search / consultation fee settled. */
  feePaidAt: Date | null;
  /** Sourcing options sent to the student, and whether they picked one. */
  optionsSentAt: Date | null;
  optionCount: number;
  hasSelectedOption: boolean;
  batchId: string | null;
  /** Purposes of proofs waiting to be confirmed. */
  pendingPayments: readonly PaymentPurpose[];
}

/** The drawers an action can open. */
export const DIALOGS = ["quote", "fee", "options", "payment", "qc", "batch", "refund", "restricted", "balance"] as const;
export type DialogKind = (typeof DIALOGS)[number];

export type AdminAction =
  /** One tap (plus confirm) moves the order to `to`. */
  | { kind: "advance"; label: string; to: OrderStatus }
  /** Needs input: opens a drawer over the board or order page. */
  | { kind: "dialog"; label: string; dialog: DialogKind };

export function isRestrictedHold(o: Pick<QueueOrder, "restrictedFlag" | "restrictedClearedAt">): boolean {
  return o.restrictedFlag && !o.restrictedClearedAt;
}

export function needsUpfrontFee(o: Pick<QueueOrder, "pathType">): boolean {
  return o.pathType === "reverse_search" || o.pathType === "consultation";
}

function advance(o: QueueOrder, label: string, to: OrderStatus): AdminAction | null {
  const ok = canTransition(o.status, to, {
    actor: "admin",
    shippingMode: o.shippingMode,
    restrictedHold: isRestrictedHold(o),
    shippingBalanceDue: o.shippingBalanceDue,
  });
  return ok ? { kind: "advance", label, to } : null;
}

const dialog = (label: string, d: DialogKind): AdminAction => ({ kind: "dialog", label, dialog: d });

function statusAction(o: QueueOrder): AdminAction | null {
  const proof = (p: PaymentPurpose) => o.pendingPayments.includes(p);
  switch (o.status) {
    case "submitted":
      if (isRestrictedHold(o)) return dialog("Review restricted item", "restricted");
      if (needsUpfrontFee(o) && !o.feePaidAt) return proof("upfront_fee") ? dialog("Confirm payment", "payment") : dialog("Mark fee paid", "fee");
      if (needsUpfrontFee(o)) return dialog("Add options", "options");
      return dialog("Send quote", "quote");
    case "sourcing":
      if (isRestrictedHold(o)) return dialog("Review restricted item", "restricted");
      if (o.hasSelectedOption) return dialog("Send quote", "quote");
      // Options are out with the student: their move.
      if (o.optionsSentAt) return null;
      return dialog("Add options", "options");
    case "awaiting_payment":
      // Without a proof the student still has to pay: nothing for the admin yet.
      return proof("order") ? dialog("Confirm payment", "payment") : null;
    case "paid":
      return advance(o, "Mark bought", "order_submitted");
    case "order_submitted":
      if (o.shippingMode === "pdd_direct") return advance(o, "Mark arrived", "arrived_my");
      if (o.shippingMode === "none") return advance(o, "Mark delivered", "completed");
      return advance(o, "Mark at warehouse", "at_warehouse");
    case "at_warehouse":
      return dialog("Record QC", "qc");
    case "qc_review":
      return advance(o, "Approve QC", "ready_to_consolidate");
    case "ready_to_consolidate":
      // In a batch already: it moves when the batch is consolidated.
      return o.batchId ? null : dialog("Add to batch", "batch");
    case "arrived_my":
    case "ready_for_pickup":
      if (o.shippingBalanceDue) return proof("balance") ? dialog("Confirm payment", "payment") : dialog("Collect balance", "balance");
      return o.status === "arrived_my" ? advance(o, "Ready for pickup", "ready_for_pickup") : advance(o, "Mark collected", "completed");
    // Waiting on the student, the seller or the whole batch.
    default:
      return null;
  }
}

/** The single primary action for this order, or null when it isn't waiting on the admin. */
export function nextAdminAction(o: QueueOrder): AdminAction | null {
  const action = statusAction(o);
  if (action) return action;
  if (o.shippingRefundDue) return dialog("Issue refund/credit", "refund");
  return null;
}

// ---- payment state on the card ------------------------------------------------

export type PaymentTone = "muted" | "pending" | "paid" | "warning";

const PAID_STATUSES: readonly OrderStatus[] = [
  "paid",
  "order_submitted",
  "at_warehouse",
  "qc_review",
  "ready_to_consolidate",
  "consolidated",
  "shipped",
  "arrived_my",
  "ready_for_pickup",
  "completed",
];

export function paymentState(o: QueueOrder): { label: string; tone: PaymentTone } {
  if (o.shippingRefundDue) return { label: "Refund due", tone: "warning" };
  if (o.shippingBalanceDue) return { label: o.pendingPayments.includes("balance") ? "Balance proof uploaded" : "Balance due", tone: "warning" };
  if (o.pendingPayments.length) return { label: "Proof uploaded", tone: "pending" };
  if (PAID_STATUSES.includes(o.status)) return { label: "Paid", tone: "paid" };
  if (o.status === "quote_sent" || o.status === "awaiting_payment") return { label: "Awaiting payment", tone: "muted" };
  if (needsUpfrontFee(o)) return o.feePaidAt ? { label: "Fee paid", tone: "paid" } : { label: "Fee unpaid", tone: "muted" };
  return { label: "Not quoted", tone: "muted" };
}

// ---- filter chips -------------------------------------------------------------

export const ACTION_FILTERS = [
  { key: "all", label: "All" },
  { key: "url", label: "URL Submitted" },
  { key: "reverse_search", label: "Reverse Search" },
  { key: "consultation", label: "Consultation" },
  { key: "ready_to_consolidate", label: "Ready to Consolidate" },
  { key: "order_submitted", label: "Order Submitted" },
  { key: "qc_review", label: "QC Review" },
  { key: "shipping_refund", label: "Shipping Refund" },
] as const;

export type ActionFilter = (typeof ACTION_FILTERS)[number]["key"];

export function isActionFilter(value: unknown): value is ActionFilter {
  return ACTION_FILTERS.some((f) => f.key === value);
}

/**
 * The first three chips split new requests (submitted, or still being sourced)
 * by path; the rest match a status or the refund flag.
 */
export function matchesFilter(o: Pick<QueueOrder, "status" | "pathType" | "shippingRefundDue">, filter: ActionFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "url":
    case "reverse_search":
    case "consultation":
      return (o.status === "submitted" || o.status === "sourcing") && o.pathType === filter;
    case "shipping_refund":
      return o.shippingRefundDue;
    default:
      return o.status === filter;
  }
}

// ---- waiting time -------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "waiting 2d" style label plus how urgent it looks (2+ days amber, 4+ red). */
export function waiting(since: Date, now: Date): { label: string; level: 0 | 1 | 2 } {
  const ms = Math.max(0, now.getTime() - since.getTime());
  const level = ms >= 4 * DAY ? 2 : ms >= 2 * DAY ? 1 : 0;
  if (ms < 60_000) return { label: "just now", level };
  if (ms < HOUR) return { label: `waiting ${Math.floor(ms / 60_000)}m`, level };
  if (ms < DAY) return { label: `waiting ${Math.floor(ms / HOUR)}h`, level };
  return { label: `waiting ${Math.floor(ms / DAY)}d`, level };
}
