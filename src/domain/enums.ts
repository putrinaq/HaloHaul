// Shared enum values. The DB schema (pgEnum) and Zod schemas both derive from
// these tuples so the two can never drift apart.

export const USER_ROLES = ["student", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PATH_TYPES = ["url", "reverse_search", "consultation", "digital"] as const;
export type PathType = (typeof PATH_TYPES)[number];

export const PLATFORMS = [
  "taobao",
  "pdd",
  "weidian",
  "1688",
  "xianyu",
  "meituan",
  "jd",
  "dewu",
  "rednote",
  "douyin",
  "other",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const SHIPPING_MODES = ["air", "air_sensitive", "sea", "pdd_direct", "none"] as const;
export type ShippingMode = (typeof SHIPPING_MODES)[number];

/** Modes that travel with a forwarder in a consolidated batch. */
export const BATCH_SHIPPING_MODES = ["air", "air_sensitive", "sea"] as const;
export type BatchShippingMode = (typeof BATCH_SHIPPING_MODES)[number];

export function isBatchShippingMode(mode: ShippingMode): mode is BatchShippingMode {
  return (BATCH_SHIPPING_MODES as readonly string[]).includes(mode);
}

export const ORDER_STATUSES = [
  "submitted",
  "needs_info",
  "sourcing",
  "quote_sent",
  "awaiting_payment",
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
  "rejected",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CONDITION_PREFERENCES = ["new_only", "secondhand_ok", "either"] as const;
export type ConditionPreference = (typeof CONDITION_PREFERENCES)[number];

export const FULFILMENT_METHODS = ["campus_pickup", "lalamove"] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];

export const QUOTE_STATUSES = ["sent", "accepted", "declined", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const BATCH_STATUSES = [
  "open",
  "locked",
  "consolidated",
  "shipped",
  "arrived",
  "distributed",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/**
 * Signed ledger entries: positive = owed by the student, negative = credit.
 * Charges are positive; `payment` (money received) and `refund` (a credit) are
 * negative; `payout` (money sent back by bank transfer) is positive, so a
 * refunded credit nets back to zero.
 */
export const LEDGER_ENTRY_TYPES = [
  "service_fee",
  "item_payment",
  "shipping_estimate",
  "shipping_adjustment",
  "refund",
  "delivery_fee",
  "consultation_fee",
  "reverse_search_fee",
  "payment",
  "payout",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** `admin_recorded`: money the admin received outside the proof flow (no screenshot). */
export const PAYMENT_METHODS = ["duitnow_manual", "fiuu", "admin_recorded"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `failed` = rejected by the admin (with a reason) or a failed gateway payment. */
export const PAYMENT_STATUSES = ["pending", "confirmed", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** What a payment is for: the upfront search fee, the accepted quote, or a later balance. */
export const PAYMENT_PURPOSES = ["upfront_fee", "order", "balance"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

// ---- categories (database-driven) -------------------------------------------

export const MEASUREMENT_UNITS = ["cm", "mm"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_GROUPS = ["upper_body", "lower_body", "feet", "hands", "other"] as const;
export type MeasurementGroup = (typeof MEASUREMENT_GROUPS)[number];

export const CATEGORY_FULFILMENTS = ["physical", "digital"] as const;
export type CategoryFulfilment = (typeof CATEGORY_FULFILMENTS)[number];

export const CATEGORY_VERSION_STATUSES = ["draft", "published", "archived"] as const;
export type CategoryVersionStatus = (typeof CATEGORY_VERSION_STATUSES)[number];
