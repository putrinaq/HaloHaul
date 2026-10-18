import { pgEnum } from "drizzle-orm/pg-core";
import {
  BATCH_SHIPPING_MODES,
  BATCH_STATUSES,
  CATEGORY_FULFILMENTS,
  CATEGORY_VERSION_STATUSES,
  CONDITION_PREFERENCES,
  FULFILMENT_METHODS,
  LEDGER_ENTRY_TYPES,
  MEASUREMENT_GROUPS,
  MEASUREMENT_UNITS,
  ORDER_STATUSES,
  PATH_TYPES,
  PAYMENT_METHODS,
  PAYMENT_PURPOSES,
  PAYMENT_STATUSES,
  PLATFORMS,
  QUOTE_STATUSES,
  SHIPPING_MODES,
  USER_ROLES,
} from "../../domain/enums";

export const userRole = pgEnum("user_role", USER_ROLES);
export const pathType = pgEnum("path_type", PATH_TYPES);
export const platform = pgEnum("platform", PLATFORMS);
export const shippingMode = pgEnum("shipping_mode", SHIPPING_MODES);
export const batchShippingMode = pgEnum("batch_shipping_mode", BATCH_SHIPPING_MODES);
export const orderStatus = pgEnum("order_status", ORDER_STATUSES);
export const conditionPreference = pgEnum("condition_preference", CONDITION_PREFERENCES);
export const fulfilmentMethod = pgEnum("fulfilment_method", FULFILMENT_METHODS);
export const quoteStatus = pgEnum("quote_status", QUOTE_STATUSES);
export const batchStatus = pgEnum("batch_status", BATCH_STATUSES);
export const ledgerEntryType = pgEnum("ledger_entry_type", LEDGER_ENTRY_TYPES);
export const paymentMethod = pgEnum("payment_method", PAYMENT_METHODS);
export const paymentStatus = pgEnum("payment_status", PAYMENT_STATUSES);
export const paymentPurpose = pgEnum("payment_purpose", PAYMENT_PURPOSES);
export const measurementUnit = pgEnum("measurement_unit", MEASUREMENT_UNITS);
export const measurementGroup = pgEnum("measurement_group", MEASUREMENT_GROUPS);
export const categoryFulfilment = pgEnum("category_fulfilment", CATEGORY_FULFILMENTS);
export const categoryVersionStatus = pgEnum("category_version_status", CATEGORY_VERSION_STATUSES);
