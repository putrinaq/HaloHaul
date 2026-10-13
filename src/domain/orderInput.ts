import { z } from "zod";
import { getCategory, validateCategoryDetails } from "./categories";
import {
  CONDITION_PREFERENCES,
  FULFILMENT_METHODS,
  PATH_TYPES,
  SHIPPING_MODES,
  type ConditionPreference,
  type FulfilmentMethod,
  type PathType,
  type Platform,
  type ShippingMode,
} from "./enums";
import { routeForLink, validateProductLink } from "./links";
import { normalizeMyMobile } from "./phone";
import { availableShippingModes } from "./shippingOptions";

// The order form's input, validated identically in the browser (as the React
// Hook Form resolver) and on the server (before insert). Field error keys are
// the form's field paths, e.g. "productUrl", "details.chest_cm", "contact.phone".

export const MAX_REFERENCE_PHOTOS = 6;

export const orderFormSchema = z.object({
  pathType: z.enum(PATH_TYPES),
  /** Raw pasted text; the link is extracted and validated separately. */
  productUrl: z.string().max(4000).default(""),
  itemName: z
    .string()
    .trim()
    .min(2, "Tell us what the item is, e.g. “Canvas sneakers”")
    .max(120, "Keep the item name under 120 characters"),
  quantity: z.coerce
    .number({ error: "Quantity must be a number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "For more than 99, leave a remark and we'll quote in bulk"),
  category: z.string().min(1, "Choose a category"),
  details: z.record(z.string(), z.unknown()).default({}),
  variantText: z.string().trim().max(200, "Keep the option under 200 characters").default(""),
  conditionPreference: z.enum(CONDITION_PREFERENCES).optional().nullable(),
  shippingMode: z.enum(SHIPPING_MODES, { error: "Choose a shipping option" }),
  fulfilment: z.enum(FULFILMENT_METHODS).default("campus_pickup"),
  domesticFreeShipping: z.boolean().default(false),
  remarks: z.string().trim().max(2000, "Keep remarks under 2,000 characters").default(""),
  referencePhotoKeys: z
    .array(z.string().max(300))
    .max(MAX_REFERENCE_PHOTOS, `Up to ${MAX_REFERENCE_PHOTOS} photos`)
    .default([]),
  saveMeasurements: z.boolean().default(true),
  contact: z.object({
    displayName: z.string().trim().min(2, "Enter your name").max(80),
    phone: z.string().trim().min(1, "Enter your WhatsApp number"),
    campus: z.string().trim().max(120).default(""),
  }),
  acceptTerms: z.boolean().refine((v) => v, "Please accept the terms to submit"),
});

export type OrderFormInput = z.input<typeof orderFormSchema>;
export type OrderFormValues = z.output<typeof orderFormSchema>;

export interface NormalizedOrder {
  pathType: PathType;
  /** True if a content-post link moved this from "url" to "reverse_search". */
  rerouted: boolean;
  platform: Platform;
  productUrl: string | null;
  itemName: string;
  quantity: number;
  category: string;
  categorySchemaVersion: number;
  details: Record<string, unknown>;
  variantText: string | null;
  conditionPreference: ConditionPreference | null;
  shippingMode: ShippingMode;
  fulfilment: FulfilmentMethod;
  domesticFreeShipping: boolean;
  remarks: string | null;
  referencePhotoKeys: string[];
  saveMeasurements: boolean;
  contact: { displayName: string; phone: string; campus: string | null };
}

export type OrderValidationResult =
  | { ok: true; value: NormalizedOrder }
  | { ok: false; fieldErrors: Record<string, string> };

export function validateOrderInput(raw: unknown): OrderValidationResult {
  const fieldErrors: Record<string, string> = {};
  const add = (key: string, message: string) => {
    fieldErrors[key] ??= message;
  };

  const parsed = orderFormSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add(issue.path.map(String).join(".") || "_form", issue.message);
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;

  // ---- link and path routing ----------------------------------------------
  let pathType = v.pathType;
  let rerouted = false;
  let platform: Platform = "other";
  let productUrl: string | null = null;
  const linkText = v.productUrl.trim();

  if (pathType === "url" && !linkText) add("productUrl", "Paste the product link");
  if (linkText) {
    const link = validateProductLink(linkText);
    if (!link.ok) {
      add("productUrl", link.error);
    } else {
      platform = link.platform;
      productUrl = link.url;
      ({ pathType, rerouted } = routeForLink(pathType, link));
    }
  }

  // ---- category ------------------------------------------------------------
  let category;
  try {
    category = getCategory(v.category);
  } catch {
    add("category", "Choose a category");
    return { ok: false, fieldErrors };
  }
  if (pathType === "digital" && category.key !== "digital") {
    add("category", "Digital orders use the Digital product category");
  }
  if (pathType !== "digital" && category.key === "digital") {
    add("category", "For digital items, choose “You want a digital product” at the start");
  }

  const cat = validateCategoryDetails({ category: category.key, details: v.details, variantText: v.variantText });
  if (!cat.ok) {
    for (const [key, message] of Object.entries(cat.fieldErrors)) {
      add(key === "variant_text" ? "variantText" : `details.${key}`, message);
    }
  }

  // ---- what we're searching from ----------------------------------------
  if (pathType === "reverse_search" && v.referencePhotoKeys.length === 0 && !productUrl) {
    add("referencePhotoKeys", "Add at least one photo or screenshot of the item");
  }
  const needsCondition = pathType === "reverse_search" || pathType === "consultation" || !productUrl;
  if (needsCondition && pathType !== "digital" && !v.conditionPreference) {
    add("conditionPreference", "Tell us whether secondhand is OK");
  }
  if (pathType === "consultation" && v.remarks.length < 10) {
    add("remarks", "Describe what you need (and your budget) so we can research it");
  }

  // ---- shipping ------------------------------------------------------------
  const modes = availableShippingModes(platform, pathType, category);
  if (!modes.includes(v.shippingMode)) {
    add("shippingMode", modes.length === 1 && modes[0] === "none" ? "Digital items don't ship" : "Choose one of the shipping options shown");
  }
  const shippable = v.shippingMode !== "none";

  // ---- contact -------------------------------------------------------------
  const phone = normalizeMyMobile(v.contact.phone);
  if (!phone) add("contact.phone", "Enter a Malaysian mobile number, e.g. 012-345 6789");

  if (Object.keys(fieldErrors).length > 0 || !cat.ok || !phone) return { ok: false, fieldErrors };

  return {
    ok: true,
    value: {
      pathType,
      rerouted,
      platform,
      productUrl,
      itemName: v.itemName,
      quantity: v.quantity,
      category: cat.category,
      categorySchemaVersion: cat.version,
      details: cat.details,
      variantText: v.variantText || null,
      conditionPreference: pathType === "digital" ? null : (v.conditionPreference ?? null),
      shippingMode: v.shippingMode,
      fulfilment: shippable ? v.fulfilment : "campus_pickup",
      domesticFreeShipping: shippable && v.domesticFreeShipping,
      remarks: v.remarks || null,
      referencePhotoKeys: v.referencePhotoKeys,
      saveMeasurements: v.saveMeasurements,
      contact: { displayName: v.contact.displayName, phone, campus: v.contact.campus || null },
    },
  };
}
