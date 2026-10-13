import type { OrderStatus, ShippingMode } from "./enums";

// The student's tracking timeline: a short list of milestones for the order's
// shipping mode, with each status mapped onto the milestone it belongs to.

export interface Milestone {
  key: string;
  title: string;
  statuses: readonly OrderStatus[];
}

const REQUEST: Milestone = { key: "request", title: "Request received", statuses: ["submitted", "needs_info", "sourcing"] };
const QUOTE: Milestone = { key: "quote", title: "Quote & payment", statuses: ["quote_sent", "awaiting_payment"] };
const BOUGHT: Milestone = { key: "bought", title: "Bought from seller", statuses: ["paid", "order_submitted"] };
const WAREHOUSE: Milestone = {
  key: "warehouse",
  title: "Warehouse & quality check",
  statuses: ["at_warehouse", "qc_review", "ready_to_consolidate", "consolidated"],
};
const SHIPPED: Milestone = { key: "shipped", title: "Shipped to Malaysia", statuses: ["shipped", "arrived_my"] };
const ARRIVED: Milestone = { key: "arrived", title: "Arrived in Malaysia", statuses: ["arrived_my"] };
const PICKUP: Milestone = { key: "pickup", title: "Ready for pickup", statuses: ["ready_for_pickup"] };
const DONE: Milestone = { key: "done", title: "Collected", statuses: ["completed"] };
const DELIVERED: Milestone = { key: "done", title: "Delivered", statuses: ["completed"] };

export function journeyFor(mode: ShippingMode): Milestone[] {
  switch (mode) {
    case "none":
      return [REQUEST, QUOTE, BOUGHT, DELIVERED];
    case "pdd_direct":
      return [REQUEST, QUOTE, BOUGHT, ARRIVED, PICKUP, DONE];
    default:
      return [REQUEST, QUOTE, BOUGHT, WAREHOUSE, { ...SHIPPED, statuses: ["shipped", "arrived_my"] }, PICKUP, DONE];
  }
}

export type MilestoneState = "done" | "current" | "upcoming";

/**
 * State of each milestone for the current status. Terminal "rejected" and
 * "cancelled" orders stop the journey: earlier milestones stay done, nothing
 * is current.
 */
export function journeyProgress(
  status: OrderStatus,
  mode: ShippingMode,
  reachedStatuses: readonly OrderStatus[] = [],
): Array<Milestone & { state: MilestoneState }> {
  const steps = journeyFor(mode);
  const stopped = status === "rejected" || status === "cancelled";
  const anchor = stopped ? (reachedStatuses.at(-1) ?? "submitted") : status;
  const index = Math.max(0, steps.findIndex((m) => m.statuses.includes(anchor)));

  return steps.map((m, i) => {
    let state: MilestoneState = "upcoming";
    if (status === "completed" || i < index || (stopped && i === index)) state = "done";
    else if (i === index) state = "current";
    return { ...m, state };
  });
}
