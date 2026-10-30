"use server";

import { getDb } from "@/db/client";
import { refresh } from "next/cache";
import { z } from "zod";
import { deleteDraft } from "@/server/drafts";
import { submitOrder, type SubmitOrderResult } from "@/server/orders/submit";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getSessionUser } from "@/server/session";

/** `draftId`: the cart item this form was opened from; it leaves the cart once the order exists. */
export async function submitOrderAction(raw: unknown, draftId: string | null = null): Promise<SubmitOrderResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, fieldErrors: {}, formError: "Your session expired. Sign in again to submit." };

  const limit = rateLimit(`order:${user.id}`, LIMITS.orderSubmit.limit, LIMITS.orderSubmit.windowMs);
  if (!limit.ok) {
    return {
      ok: false,
      fieldErrors: {},
      formError: `You've sent several requests in a short time. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.`,
    };
  }
  const db = getDb();
  const result = await submitOrder(db, user.id, raw);
  if (result.ok && draftId && z.uuid().safeParse(draftId).success && (await deleteDraft(db, user.id, draftId))) refresh();
  return result;
}
