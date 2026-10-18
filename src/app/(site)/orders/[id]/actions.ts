"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { PAYMENT_PURPOSES } from "@/domain/enums";
import { UserError } from "@/server/errors";
import { acceptQuote, answerNeedsInfo, cancelOwnOrder, declineQuote, selectSourcingOption, submitPaymentProof } from "@/server/orders/studentOps";
import { rateLimit } from "@/server/rateLimit";
import { getSessionUser } from "@/server/session";

// The student's order actions. Always the session user's own order (the
// operations lock it by id *and* customer), validated and rate-limited.

export type StudentResult = { ok: true } | { ok: false; error: string };

async function asStudent<S extends z.ZodType>(schema: S, raw: unknown, fn: (userId: string, input: z.output<S>) => Promise<unknown>): Promise<StudentResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in again to continue." };
  if (!rateLimit(`order-action:${user.id}`, 30, 10 * 60_000).ok) return { ok: false, error: "That's a lot of changes. Give it a few minutes." };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That didn't look right." };
  try {
    await fn(user.id, parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

const orderId = z.number().int().positive();

export async function chooseOptionAction(raw: unknown) {
  return asStudent(z.object({ orderId, optionId: z.uuid() }), raw, (uid, i) => selectSourcingOption(getDb(), uid, i));
}

export async function acceptQuoteAction(raw: unknown) {
  return asStudent(z.object({ orderId }), raw, (uid, i) => acceptQuote(getDb(), uid, i));
}

export async function declineQuoteAction(raw: unknown) {
  return asStudent(z.object({ orderId }), raw, (uid, i) => declineQuote(getDb(), uid, i));
}

export async function submitProofAction(raw: unknown) {
  return asStudent(
    z.object({
      orderId,
      purpose: z.enum(PAYMENT_PURPOSES),
      amountSen: z.number().int().min(1, "Enter the amount you paid").max(100_000_000),
      proofKey: z.string().max(300),
      reference: z.string().trim().max(120).nullable(),
    }),
    raw,
    (uid, i) => submitPaymentProof(getDb(), uid, i),
  );
}

export async function replyAction(raw: unknown) {
  return asStudent(z.object({ orderId, reply: z.string().trim().min(2, "Write a reply").max(2000) }), raw, (uid, i) => answerNeedsInfo(getDb(), uid, i));
}

export async function cancelAction(raw: unknown) {
  return asStudent(z.object({ orderId, reason: z.string().trim().max(500).nullable() }), raw, (uid, i) => cancelOwnOrder(getDb(), uid, i));
}
