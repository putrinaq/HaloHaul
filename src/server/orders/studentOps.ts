import "server-only";
import { and, eq } from "drizzle-orm";
import { payments, quotes, sourcingOptions } from "../../db/schema";
import type { Db } from "../../db/types";
import { needsUpfrontFee } from "../../domain/adminQueue";
import type { PaymentPurpose } from "../../domain/enums";
import { quoteCharges } from "../../domain/ledger";
import { formatMyr } from "../../domain/money";
import { isPrePayment } from "../../domain/orderStateMachine";
import { UserError } from "../errors";
import { isOwnPhotoKey } from "../photos";
import { lockOwnOrder, moveOrder, noteOnOrder, orderBalance, postLedger, settleCancellation, type ActorRef } from "./core";

// What a student can do to their own order. Every function locks the order
// *for this user* (someone else's order looks missing) and re-checks state.

const student = (id: string): ActorRef => ({ id, kind: "student" });

export async function selectSourcingOption(db: Db, userId: string, input: { orderId: number; optionId: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (order.status !== "sourcing" || !order.optionsSentAt) throw new UserError("Options can't be chosen right now.");
    const [opt] = await tx
      .select({ id: sourcingOptions.id, title: sourcingOptions.title })
      .from(sourcingOptions)
      .where(and(eq(sourcingOptions.id, input.optionId), eq(sourcingOptions.orderId, order.id)));
    if (!opt) throw new UserError("That option isn't available any more.");
    await tx.update(sourcingOptions).set({ isSelected: false }).where(eq(sourcingOptions.orderId, order.id));
    await tx.update(sourcingOptions).set({ isSelected: true }).where(eq(sourcingOptions.id, opt.id));
    await noteOnOrder(tx, order, userId, `Chose “${opt.title}”`);
  });
}

/** Accepting posts the quote's charges and moves the order to payment. */
export async function acceptQuote(db: Db, userId: string, input: { orderId: number }, now = new Date()) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (order.status !== "quote_sent") throw new UserError("There's no quote to accept right now.");
    const [quote] = await tx.select().from(quotes).where(and(eq(quotes.orderId, order.id), eq(quotes.status, "sent")));
    if (!quote) throw new UserError("There's no quote to accept right now.");
    if (quote.expiresAt < now) {
      await tx.update(quotes).set({ status: "expired" }).where(eq(quotes.id, quote.id));
      throw new UserError("This quote has expired. Message us and we'll send a fresh one.");
    }
    await tx.update(quotes).set({ status: "accepted", respondedAt: now }).where(eq(quotes.id, quote.id));
    const feeType = order.pathType === "reverse_search" ? "reverse_search_fee" : order.pathType === "consultation" ? "consultation_fee" : null;
    await postLedger(tx, order, quoteCharges({ ...quote, feeType }), userId);
    await moveOrder(tx, order, "awaiting_payment", student(userId), { note: `Quote accepted: ${formatMyr(quote.totalMaxSen)}` });
    return { totalMaxSen: quote.totalMaxSen };
  });
}

/** Declining cancels the order (the upfront search fee, if any, is kept). */
export async function declineQuote(db: Db, userId: string, input: { orderId: number }, now = new Date()) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (order.status !== "quote_sent") throw new UserError("There's no quote to decline right now.");
    await tx
      .update(quotes)
      .set({ status: "declined", respondedAt: now })
      .where(and(eq(quotes.orderId, order.id), eq(quotes.status, "sent")));
    await moveOrder(tx, order, "cancelled", student(userId), { note: "Quote declined" });
  });
}

/** A DuitNow proof for the admin to confirm. One pending proof per purpose at a time. */
export async function submitPaymentProof(
  db: Db,
  userId: string,
  input: { orderId: number; purpose: PaymentPurpose; amountSen: number; proofKey: string; reference: string | null },
) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (!isOwnPhotoKey(userId, input.proofKey)) throw new UserError("Upload the screenshot again.");
    switch (input.purpose) {
      case "upfront_fee":
        if (!needsUpfrontFee(order) || order.feePaidAt) throw new UserError("There's no fee to pay on this order.");
        break;
      case "order":
        if (order.status !== "awaiting_payment") throw new UserError("This order isn't waiting for payment.");
        break;
      case "balance":
        if (!order.shippingBalanceDue && (await orderBalance(tx, order.id)).owedSen === 0) throw new UserError("Nothing is owed on this order.");
        break;
    }
    const [waitingProof] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.purpose, input.purpose), eq(payments.status, "pending")));
    if (waitingProof) throw new UserError("We already have a proof for this — we'll check it soon.");
    await tx.insert(payments).values({
      orderId: order.id,
      method: "duitnow_manual",
      purpose: input.purpose,
      amountSen: input.amountSen,
      proofPhotoKey: input.proofKey,
      reference: input.reference,
      createdBy: userId,
    });
    await noteOnOrder(tx, order, userId, `Payment proof uploaded: ${formatMyr(input.amountSen)}`);
  });
}

/** Replies to "needs info": the answer is added to the remarks and the order goes back for review. */
export async function answerNeedsInfo(db: Db, userId: string, input: { orderId: number; reply: string }) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (order.status !== "needs_info") throw new UserError("We're not waiting on an answer for this order.");
    const remarks = [order.remarks, `Reply: ${input.reply}`].filter(Boolean).join("\n\n");
    await moveOrder(tx, order, "submitted", student(userId), { note: input.reply, set: { remarks } });
  });
}

/** Before anything is bought, students can cancel; a paid order becomes a refund to issue. */
export async function cancelOwnOrder(db: Db, userId: string, input: { orderId: number; reason: string | null }) {
  return db.transaction(async (tx) => {
    const order = await lockOwnOrder(tx, userId, input.orderId);
    if (!isPrePayment(order.status) && order.status !== "paid") throw new UserError("This order can't be cancelled any more: it's been bought.");
    const moved = await moveOrder(tx, order, "cancelled", student(userId), { note: input.reason || "Cancelled by the student" });
    await settleCancellation(tx, moved, userId, `cancelled:${order.id}`);
  });
}
