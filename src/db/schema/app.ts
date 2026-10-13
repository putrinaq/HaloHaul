import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ShippingChoiceSnapshot } from "../../domain/analytics";
import type { SettingsInput } from "../../domain/settings";
import { users } from "./auth";
import {
  batchShippingMode,
  batchStatus,
  conditionPreference,
  fulfilmentMethod,
  ledgerEntryType,
  orderStatus,
  pathType,
  paymentMethod,
  paymentStatus,
  platform,
  quoteStatus,
  shippingMode,
} from "./enums";

// Conventions
//   money:      integer minor units — *_sen (MYR) / *_fen (RMB)
//   fx rates:   numeric(12,6), MYR per 1 CNY, stored next to every RMB amount
//   weights:    integer grams (*_g);  dimensions: integer millimetres (*_mm)
//   timestamps: timestamptz; displayed in Asia/Kuala_Lumpur

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp({ withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
const fxRate = () => numeric({ precision: 12, scale: 6 });

// ---- customers -------------------------------------------------------------

export const customerProfiles = pgTable("customer_profiles", {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text().notNull(),
  /** WhatsApp number, E.164 (+60…). Personal data. */
  phone: text(),
  campus: text(),
  /** `{ [categoryKey]: details }` — validated per category by the registry. Personal data. */
  savedMeasurements: jsonb().$type<Record<string, Record<string, unknown>>>().notNull().default({}),
  createdAt,
  updatedAt,
});

// ---- batches ---------------------------------------------------------------

export const batches = pgTable(
  "batches",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Display code, e.g. "Air #12". */
    code: text().notNull().unique(),
    mode: batchShippingMode().notNull(),
    cutoffAt: timestamp({ withTimezone: true }).notNull(),
    minOrders: integer().notNull().default(1),
    status: batchStatus().notNull().default("open"),
    forwarder: text(),
    /** Campus pickup window, shown on the calendar. */
    pickupStartsAt: timestamp({ withTimezone: true }),
    pickupEndsAt: timestamp({ withTimezone: true }),
    actualWeightG: integer(),
    actualCostFen: integer(),
    actualCostFxRate: fxRate(),
    lockedAt: timestamp({ withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index().on(t.status, t.cutoffAt),
    check("batches_min_orders_positive", sql`min_orders >= 1`),
    check(
      "batches_cost_has_rate",
      sql`actual_cost_fen IS NULL OR actual_cost_fx_rate IS NOT NULL`,
    ),
  ],
);

// ---- orders ----------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    /** Human-readable order number, shown as #1001. */
    id: integer().primaryKey().generatedAlwaysAsIdentity({ startWith: 1001 }),
    customerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    pathType: pathType().notNull(),
    platform: platform().notNull(),
    /** What the student calls the item, e.g. "Canvas sneakers". Shown on admin cards. */
    itemName: text().notNull(),
    productUrl: text(),
    referencePhotoKeys: text().array().notNull().default(sql`'{}'::text[]`),

    category: text().notNull(),
    categorySchemaVersion: integer().notNull(),
    /** Category-specific fields, validated by the category registry. Personal data. */
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    variantText: text(),
    quantity: integer().notNull().default(1),
    conditionPreference: conditionPreference(),

    shippingMode: shippingMode().notNull(),
    fulfilment: fulfilmentMethod().notNull().default("campus_pickup"),
    /** Listing is 包邮 — covers the domestic China leg only. */
    domesticFreeShipping: boolean().notNull().default(false),
    /** Options and price/speed differences shown when the mode was chosen. */
    shippingChoiceSnapshot: jsonb().$type<ShippingChoiceSnapshot>(),

    status: orderStatus().notNull().default("submitted"),
    batchId: uuid().references(() => batches.id, { onDelete: "set null" }),

    estWeightG: integer(),
    estLengthMm: integer(),
    estWidthMm: integer(),
    estHeightMm: integer(),
    /** True when the estimate came from the seller rather than the category default. */
    estSellerConfirmed: boolean().notNull().default(false),
    finalWeightG: integer(),
    finalLengthMm: integer(),
    finalWidthMm: integer(),
    finalHeightMm: integer(),

    trackingNumber: text(),
    /** Free text shown to the student. */
    trackingNote: text(),

    restrictedFlag: boolean().notNull().default(false),
    restrictedReason: text(),
    restrictedClearedAt: timestamp({ withTimezone: true }),
    restrictedClearedBy: text().references(() => users.id, { onDelete: "set null" }),

    shippingBalanceDue: boolean().notNull().default(false),
    shippingRefundDue: boolean().notNull().default(false),

    /** From the student. */
    remarks: text(),
    /** Admin only — never sent to the student. */
    internalNotes: text(),

    createdAt,
    updatedAt,
  },
  (t) => [
    index().on(t.customerId, t.createdAt),
    index().on(t.status, t.createdAt),
    index().on(t.batchId),
    check("orders_quantity_positive", sql`quantity >= 1`),
    check(
      "orders_link_or_condition",
      sql`product_url IS NOT NULL OR condition_preference IS NOT NULL OR path_type = 'digital'`,
    ),
    check("orders_no_batch_for_direct", sql`batch_id IS NULL OR shipping_mode IN ('air','air_sensitive','sea')`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    /** Null when the worker made the change. */
    actorId: text().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    createdAt,
  },
  (t) => [index().on(t.orderId, t.createdAt)],
);

export const sourcingOptions = pgTable(
  "sourcing_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    title: text().notNull(),
    url: text().notNull(),
    priceFen: integer().notNull(),
    sellerNote: text(),
    photoKey: text(),
    estWeightG: integer(),
    estLengthMm: integer(),
    estWidthMm: integer(),
    estHeightMm: integer(),
    isSelected: boolean().notNull().default(false),
    createdAt,
  },
  (t) => [
    index().on(t.orderId),
    // At most one selected option per order.
    uniqueIndex("sourcing_options_one_selected").on(t.orderId).where(sql`is_selected`),
    check("sourcing_options_price_nonneg", sql`price_fen >= 0`),
  ],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    sourcingOptionId: uuid().references(() => sourcingOptions.id, { onDelete: "set null" }),
    itemPriceFen: integer().notNull(),
    fxRate: fxRate().notNull(),
    /** itemPriceFen converted at fxRate, pinned so the quote never changes. */
    itemPriceSen: integer().notNull(),
    serviceFeeSen: integer().notNull(),
    shippingEstimateMinSen: integer().notNull(),
    shippingEstimateMaxSen: integer().notNull(),
    deliveryFeeSen: integer().notNull().default(0),
    /** Upfront reverse-search / consultation fee credited toward this order. */
    feeCreditSen: integer().notNull().default(0),
    totalMinSen: integer().notNull(),
    totalMaxSen: integer().notNull(),
    status: quoteStatus().notNull().default("sent"),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    respondedAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [
    index().on(t.orderId, t.createdAt),
    // Only one live quote per order.
    uniqueIndex("quotes_one_open_per_order").on(t.orderId).where(sql`status = 'sent'`),
    check("quotes_shipping_range", sql`shipping_estimate_min_sen <= shipping_estimate_max_sen`),
    check("quotes_total_range", sql`total_min_sen <= total_max_sen`),
    check(
      "quotes_amounts_nonneg",
      sql`item_price_fen >= 0 AND item_price_sen >= 0 AND service_fee_sen >= 0 AND shipping_estimate_min_sen >= 0 AND delivery_fee_sen >= 0 AND fee_credit_sen >= 0 AND total_min_sen >= 0`,
    ),
  ],
);

// ---- money -----------------------------------------------------------------

/** Append-only (enforced by trigger). Corrections are new entries. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: integer().references(() => orders.id, { onDelete: "restrict" }),
    customerId: text()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: ledgerEntryType().notNull(),
    /** Positive = owed by the student, negative = credit. */
    amountSen: integer().notNull(),
    /** RMB source amount and rate, when the entry was converted from RMB. */
    sourceAmountFen: integer(),
    fxRate: fxRate(),
    /** Free-form reference, e.g. a payment id or batch code. */
    reference: text(),
    /** Null when the worker posted the entry. */
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt,
  },
  (t) => [
    index().on(t.orderId, t.createdAt),
    index().on(t.customerId, t.createdAt),
    check("ledger_amount_nonzero", sql`amount_sen <> 0`),
    check("ledger_fen_has_rate", sql`source_amount_fen IS NULL OR fx_rate IS NOT NULL`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: integer()
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    method: paymentMethod().notNull(),
    amountSen: integer().notNull(),
    /** R2 key of the DuitNow proof screenshot (manual payments). */
    proofPhotoKey: text(),
    /** Fiuu tranID. UNIQUE so callbacks are idempotent. */
    providerTranId: text().unique(),
    status: paymentStatus().notNull().default("pending"),
    rawPayload: jsonb(),
    confirmedBy: text().references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp({ withTimezone: true }),
    createdAt,
  },
  (t) => [
    index().on(t.orderId),
    index().on(t.status, t.createdAt),
    check("payments_amount_positive", sql`amount_sen > 0`),
    check(
      "payments_manual_has_proof",
      sql`method <> 'duitnow_manual' OR proof_photo_key IS NOT NULL`,
    ),
  ],
);

// ---- catalogue & config ----------------------------------------------------

export const restrictedItems = pgTable("restricted_items", {
  id: uuid().primaryKey().defaultRandom(),
  /** Matched case-insensitively against title, URL, variant and remarks. */
  keyword: text().notNull(),
  /** Empty = applies to every mode. */
  appliesToModes: shippingMode().array().notNull().default(sql`'{}'`),
  /** Null = every forwarder. */
  forwarder: text(),
  note: text(),
  createdAt,
});

export const showcaseProducts = pgTable(
  "showcase_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    variant: text(),
    platform: platform().notNull(),
    shippingMode: shippingMode().notNull(),
    productUrl: text(),
    category: text(),
    retailPriceSen: integer().notNull(),
    halohaulPriceSen: integer().notNull(),
    photoKey: text(),
    sourceOrderId: integer().references(() => orders.id, { onDelete: "set null" }),
    retailCheckedAt: timestamp({ withTimezone: true }),
    isPublished: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [index().on(t.isPublished, t.sortOrder)],
);

/** Single row (id = 1). `data` is validated by `settingsSchema`. */
export const settings = pgTable(
  "settings",
  {
    id: smallint().primaryKey().default(1),
    data: jsonb().$type<SettingsInput>().notNull().default({}),
    updatedBy: text().references(() => users.id, { onDelete: "set null" }),
    updatedAt,
  },
  () => [check("settings_singleton", sql`id = 1`)],
);
