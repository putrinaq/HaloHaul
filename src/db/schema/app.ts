import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { ShippingChoiceSnapshot } from "../../domain/analytics";
import type { CategoryDefinition } from "../../domain/categoryDefinition";
import type { SettingsInput } from "../../domain/settings";
import { users } from "./auth";
import {
  batchShippingMode,
  batchStatus,
  categoryFulfilment,
  categoryVersionStatus,
  conditionPreference,
  fulfilmentMethod,
  ledgerEntryType,
  measurementGroup,
  measurementUnit,
  orderStatus,
  pathType,
  paymentMethod,
  paymentPurpose,
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
  /** `{ [measurementKey]: number }`, keys from `measurement_definitions`. Personal data. */
  savedMeasurements: jsonb().$type<Record<string, number>>().notNull().default({}),
  /** Admin only — never shown to the student. */
  internalNotes: text(),
  /** Set when the account was anonymised on request; personal fields are cleared. */
  anonymisedAt: timestamp({ withTimezone: true }),
  createdAt,
  updatedAt,
});

// ---- categories (edited in Settings → Categories) ---------------------------

/** Shared body measurements, reused across categories so a saved value works everywhere. */
export const measurementDefinitions = pgTable(
  "measurement_definitions",
  {
    key: text().primaryKey(),
    label: text().notNull(),
    unit: measurementUnit().notNull(),
    min: doublePrecision().notNull(),
    max: doublePrecision().notNull(),
    step: doublePrecision().notNull(),
    helpText: text(),
    /** R2 key of a how-to-measure picture. */
    helpImageKey: text(),
    group: measurementGroup().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt,
    updatedAt,
  },
  () => [
    check("measurement_definitions_key", sql`key ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check("measurement_definitions_range", sql`min < max AND step > 0`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Immutable once any order uses it. */
    key: text().notNull().unique(),
    name: text().notNull(),
    /** Lucide icon name from the curated list in domain/categoryIcons. */
    icon: text().notNull().default("Package"),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    fulfilment: categoryFulfilment().notNull().default("physical"),
    /** Per-item default parcel for the shipping estimate (grams / millimetres). */
    defaultWeightG: integer().notNull().default(0),
    defaultLengthMm: integer().notNull().default(0),
    defaultWidthMm: integer().notNull().default(0),
    defaultHeightMm: integer().notNull().default(0),
    allowedShippingModes: shippingMode().array().notNull().default(sql`'{}'`),
    /** Shown to the student when the category has shipping limits. */
    restrictedNote: text(),
    currentPublishedVersionId: uuid().references((): AnyPgColumn => categoryVersions.id, { onDelete: "restrict" }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index().on(t.isActive, t.sortOrder),
    check("categories_key", sql`key ~ '^[a-z][a-z0-9_]{0,39}$'`),
    check(
      "categories_parcel_nonneg",
      sql`default_weight_g >= 0 AND default_length_mm >= 0 AND default_width_mm >= 0 AND default_height_mm >= 0`,
    ),
  ],
);

export const categoryVersions = pgTable(
  "category_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    status: categoryVersionStatus().notNull().default("draft"),
    /** Validated by `definitionSchema` before every save. */
    definition: jsonb().$type<CategoryDefinition>().notNull(),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
    createdAt,
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex().on(t.categoryId, t.version),
    // At most one draft and one published version per category.
    uniqueIndex("category_versions_one_draft").on(t.categoryId).where(sql`status = 'draft'`),
    uniqueIndex("category_versions_one_published").on(t.categoryId).where(sql`status = 'published'`),
    check("category_versions_version_positive", sql`version >= 1`),
  ],
);

// ---- audit & settings history -----------------------------------------------

/** Who changed what in the admin. Append-only (enforced by trigger). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: text().references(() => users.id, { onDelete: "set null" }),
    /** e.g. "settings.fees", "category.publish", "order.details_edit". */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [index().on(t.entityType, t.entityId, t.createdAt), index().on(t.createdAt)],
);

/** Every exchange rate that was ever set, newest last. The current one is also in settings. */
export const fxRates = pgTable("fx_rates", {
  id: uuid().primaryKey().defaultRandom(),
  myrPerCny: numeric({ precision: 12, scale: 6 }).notNull(),
  note: text(),
  setBy: text().references(() => users.id, { onDelete: "set null" }),
  createdAt,
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
    /** Set when the batch locked below `min_orders`; cleared once the admin extends or rolls it. */
    belowMinAlertAt: timestamp({ withTimezone: true }),
    /** When the batch weigh-in (actual weight and cost) was committed. */
    weighedAt: timestamp({ withTimezone: true }),
    notes: text(),
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

    /** The exact category definition this order was submitted (and is validated) under. */
    categoryVersionId: uuid()
      .notNull()
      .references(() => categoryVersions.id, { onDelete: "restrict" }),
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

    /** Upfront reverse-search / consultation fee settled. */
    feePaidAt: timestamp({ withTimezone: true }),
    /** Sourcing options were sent to the student to choose from. */
    optionsSentAt: timestamp({ withTimezone: true }),
    /** Warehouse arrival and quality check. */
    warehouseArrivedAt: timestamp({ withTimezone: true }),
    qcPhotoKeys: text().array().notNull().default(sql`'{}'::text[]`),
    qcNotes: text(),

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
    isRecommended: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
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
    purpose: paymentPurpose().notNull().default("order"),
    /** Amount the student says they paid (or the admin recorded). */
    amountSen: integer().notNull(),
    /** R2 key of the DuitNow proof screenshot (manual payments). */
    proofPhotoKey: text(),
    /** Bank reference the student typed, if any. */
    reference: text(),
    /** Fiuu tranID. UNIQUE so callbacks are idempotent. */
    providerTranId: text().unique(),
    status: paymentStatus().notNull().default("pending"),
    /** Why the admin rejected the proof (shown to the student). */
    rejectionReason: text(),
    rawPayload: jsonb(),
    confirmedBy: text().references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => users.id, { onDelete: "set null" }),
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
