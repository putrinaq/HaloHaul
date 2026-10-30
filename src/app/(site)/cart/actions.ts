"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { MAX_SUBMIT_AT_ONCE } from "@/domain/drafts";
import { deleteDraft, saveDraft, submitDraft, type SaveDraftResult } from "@/server/drafts";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getSessionUser } from "@/server/session";

const SIGNED_OUT = "Your session expired. Sign in again.";

/** "Add to cart": save the order form as it is, or update the cart item it came from. */
export async function saveDraftAction(input: { id: string | null; values: unknown }): Promise<SaveDraftResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!rateLimit(`draft:${user.id}`, LIMITS.draftSave.limit, LIMITS.draftSave.windowMs).ok) {
    return { ok: false, error: "That's a lot of saves at once. Try again in a minute." };
  }
  const id = z.uuid().nullable().safeParse(input?.id);
  const result = await saveDraft(getDb(), user.id, id.success ? id.data : null, input?.values);
  // The cart count in the header is part of the layout: re-render it.
  if (result.ok) refresh();
  return result;
}

export async function removeDraftAction(id: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !z.uuid().safeParse(id).success) return { ok: false };
  const ok = await deleteDraft(getDb(), user.id, id);
  if (ok) refresh();
  return { ok };
}

export type SubmitDraftOutcome =
  | { id: string; ok: true; orderId: number }
  | { id: string; ok: false; error: string };

/**
 * "Submit all ready": each cart item becomes an order, checked like any new
 * order. One that fails stays in the cart with the reason.
 */
export async function submitDraftsAction(input: { ids: string[]; acceptTerms: boolean }): Promise<{ outcomes: SubmitDraftOutcome[]; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { outcomes: [], error: SIGNED_OUT };
  if (input?.acceptTerms !== true) return { outcomes: [], error: "Please accept the terms to submit." };
  const ids = z.array(z.uuid()).min(1).max(MAX_SUBMIT_AT_ONCE).safeParse(input?.ids);
  if (!ids.success) return { outcomes: [], error: `Choose between 1 and ${MAX_SUBMIT_AT_ONCE} items.` };

  const db = getDb();
  const outcomes: SubmitDraftOutcome[] = [];
  for (const id of ids.data) {
    const limit = rateLimit(`order:${user.id}`, LIMITS.orderSubmit.limit, LIMITS.orderSubmit.windowMs);
    if (!limit.ok) {
      outcomes.push({ id, ok: false, error: `Too many orders at once. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` });
      continue;
    }
    const r = await submitDraft(db, user.id, id);
    outcomes.push(
      r.ok
        ? { id, ok: true, orderId: r.orderId }
        : { id, ok: false, error: r.formError ?? Object.values(r.fieldErrors)[0] ?? "Something needs fixing. Open it to check." },
    );
  }
  if (outcomes.some((o) => o.ok)) refresh();
  return { outcomes };
}
