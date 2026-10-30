import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { orderDrafts } from "../db/schema";
import type { Db } from "../db/types";
import { cleanDraftData, MAX_DRAFTS } from "../domain/drafts";
import { submitOrder, type SubmitOrderResult } from "./orders/submit";

// The student's cart. Every query is scoped to the student: a draft id from
// someone else's cart simply isn't found.

export type Draft = typeof orderDrafts.$inferSelect;

export function listDrafts(db: Db, userId: string): Promise<Draft[]> {
  return db.select().from(orderDrafts).where(eq(orderDrafts.customerId, userId)).orderBy(desc(orderDrafts.updatedAt));
}

export async function countDrafts(db: Db, userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(orderDrafts).where(eq(orderDrafts.customerId, userId));
  return n;
}

export async function getDraft(db: Db, userId: string, id: string): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(orderDrafts)
    .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerId, userId)));
  return row ?? null;
}

export type SaveDraftResult = { ok: true; id: string } | { ok: false; error: string };

/** Adds a draft to the cart, or updates one already there (`id`). */
export async function saveDraft(db: Db, userId: string, id: string | null, raw: unknown): Promise<SaveDraftResult> {
  const data = cleanDraftData(raw);
  if (!data) return { ok: false, error: "That order couldn't be saved. Try again." };
  if (id) {
    const [row] = await db
      .update(orderDrafts)
      .set({ data })
      .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerId, userId)))
      .returning({ id: orderDrafts.id });
    if (row) return { ok: true, id: row.id };
    // Removed from the cart in another tab meanwhile: save it as a new item.
  }
  if ((await countDrafts(db, userId)) >= MAX_DRAFTS) {
    return { ok: false, error: `Your cart is full (${MAX_DRAFTS} items). Submit or remove some first.` };
  }
  const [row] = await db.insert(orderDrafts).values({ customerId: userId, data }).returning({ id: orderDrafts.id });
  return { ok: true, id: row.id };
}

export async function deleteDraft(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(orderDrafts)
    .where(and(eq(orderDrafts.id, id), eq(orderDrafts.customerId, userId)))
    .returning({ id: orderDrafts.id });
  return rows.length > 0;
}

/**
 * Submits a cart item as a real order (validated like any new order) and
 * removes it from the cart once the order exists. The caller has checked the
 * student agreed to the terms.
 */
export async function submitDraft(db: Db, userId: string, id: string, now = new Date()): Promise<SubmitOrderResult> {
  const draft = await getDraft(db, userId, id);
  if (!draft) return { ok: false, fieldErrors: {}, formError: "That item is no longer in your cart." };
  const result = await submitOrder(db, userId, { ...draft.data, acceptTerms: true }, now);
  if (result.ok) await deleteDraft(db, userId, id);
  return result;
}
