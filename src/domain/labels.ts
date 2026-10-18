import type { BatchShippingMode, OrderStatus, PathType, Platform, ShippingMode } from "./enums";

export const PLATFORM_LABELS: Record<Platform, string> = {
  taobao: "Taobao",
  pdd: "Pinduoduo",
  weidian: "Weidian",
  "1688": "1688",
  xianyu: "Xianyu",
  meituan: "Meituan",
  jd: "JD",
  dewu: "Dewu",
  rednote: "RedNote",
  douyin: "Douyin",
  other: "Other",
};

export const PATH_LABELS: Record<PathType, string> = {
  url: "Link",
  reverse_search: "Photo search",
  consultation: "Consultation",
  digital: "Digital",
};

export const SHIPPING_MODE_LABELS: Record<ShippingMode, string> = {
  air: "Air",
  air_sensitive: "Air (sensitive goods)",
  sea: "Sea",
  pdd_direct: "PDD direct-ship",
  none: "No shipping",
};

export const BATCH_MODE_LABELS: Record<BatchShippingMode, string> = {
  air: "Air Consolidation",
  air_sensitive: "Air (Sensitive) Consolidation",
  sea: "Sea Consolidation",
};

/** Operational names for the admin (the student wording below is friendlier). */
export const ADMIN_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: "New",
  needs_info: "Needs info",
  sourcing: "Sourcing",
  quote_sent: "Quote sent",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  order_submitted: "Order submitted",
  at_warehouse: "At warehouse",
  qc_review: "QC review",
  ready_to_consolidate: "Ready to consolidate",
  consolidated: "Consolidated",
  shipped: "Shipped",
  arrived_my: "Arrived in MY",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Path tags on admin cards. */
export const ADMIN_PATH_LABELS: Record<PathType, string> = {
  url: "URL",
  reverse_search: "Reverse Search",
  consultation: "Consultation",
  digital: "Digital",
};

/** Student-facing wording for each status. */
export const STATUS_LABELS: Record<OrderStatus, { title: string; detail: string }> = {
  submitted: { title: "Submitted", detail: "We've got your request and will review it shortly." },
  needs_info: { title: "We need more info", detail: "We've asked you a question about this order." },
  sourcing: { title: "Finding the best option", detail: "We're checking sellers, prices and stock." },
  quote_sent: { title: "Quote ready", detail: "Review the breakdown and accept to continue." },
  awaiting_payment: { title: "Awaiting payment", detail: "Pay to lock in this quote." },
  paid: { title: "Paid", detail: "Payment confirmed. We'll buy it from the seller next." },
  order_submitted: { title: "Bought from seller", detail: "The seller is preparing your item." },
  at_warehouse: { title: "At the China warehouse", detail: "Your item reached the forwarder's warehouse." },
  qc_review: { title: "Quality check", detail: "We're checking the item before it ships." },
  ready_to_consolidate: { title: "Ready to ship", detail: "Waiting for the next batch cutoff." },
  consolidated: { title: "Packed in a batch", detail: "Your item is packed with the rest of the batch." },
  shipped: { title: "On the way to Malaysia", detail: "The batch has left China." },
  arrived_my: { title: "Arrived in Malaysia", detail: "Your item is in Malaysia and being sorted." },
  ready_for_pickup: { title: "Ready for pickup", detail: "Collect it at the campus pickup point." },
  completed: { title: "Collected", detail: "Enjoy! Thanks for using HaloHaul." },
  rejected: { title: "Not possible", detail: "We couldn't complete this order. See the note for why." },
  cancelled: { title: "Cancelled", detail: "This order was cancelled." },
};
