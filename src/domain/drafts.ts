import type { Catalog } from "./catalog";
import type { PathType } from "./enums";
import { orderFormSchema, validateOrderInput } from "./orderInput";

// The cart: order forms a student saved part-way ("Add to cart"). A draft is
// just the raw form; it's validated in full, exactly like a fresh order, when
// it's submitted. These helpers keep what's stored small and tidy, and say
// whether a draft is ready to go.

/** Most items a cart can hold. */
export const MAX_DRAFTS = 20;
/** Drafts nobody has touched for this long are deleted (they can hold measurements). */
export const DRAFT_TTL_DAYS = 90;
/** Most orders one "Submit all" sends (each still counts toward the order rate limit). */
export const MAX_SUBMIT_AT_ONCE = 10;
const MAX_DRAFT_CHARS = 64_000;

/**
 * Only the order form's own fields, without the terms checkbox (that's agreed
 * at submit time). Null for something that isn't a form, or is far too big.
 */
export function cleanDraftData(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(orderFormSchema.shape)) {
    if (key !== "acceptTerms" && src[key] !== undefined) out[key] = src[key];
  }
  if (JSON.stringify(out).length > MAX_DRAFT_CHARS) return null;
  return out;
}

export interface DraftSummary {
  itemName: string;
  pathType: PathType | null;
  categoryName: string | null;
  quantity: number;
  /** Everything the order needs is filled in. */
  ready: boolean;
  /** How many things still need attention, and the first one in words. */
  missing: number;
  firstProblem: string | null;
}

/** What the cart shows for a draft, judged by the same validator as a submitted order. */
export function summarizeDraft(data: Record<string, unknown>, catalog: Catalog): DraftSummary {
  const result = validateOrderInput({ ...data, acceptTerms: true }, catalog);
  const errors = result.ok ? [] : Object.values(result.fieldErrors);
  const name = typeof data.itemName === "string" ? data.itemName.trim() : "";
  const quantity = Number(data.quantity);
  const pathType = orderFormSchema.shape.pathType.safeParse(data.pathType);
  const category = catalog.categories.find((c) => c.key === data.category);
  return {
    itemName: name || "Untitled item",
    pathType: pathType.success ? pathType.data : null,
    categoryName: category?.name ?? null,
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
    ready: result.ok,
    missing: errors.length,
    firstProblem: errors[0] ?? null,
  };
}
