"use server";

import { getDb } from "@/db/client";
import { submitOrder, type SubmitOrderResult } from "@/server/orders/submit";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getSessionUser } from "@/server/session";

export async function submitOrderAction(raw: unknown): Promise<SubmitOrderResult> {
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
  return submitOrder(getDb(), user.id, raw);
}
