import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, max, ne, notExists, or, sql, sum } from "drizzle-orm";
import { batches, customerProfiles, ledgerEntries, orders, quotes, users, whatsappChats, whatsappMessages } from "../../db/schema";
import type { Db } from "../../db/types";
import { cleanParam, fillTemplate, isMediaKind, isWindowOpen, nextStatus, previewOf, type WaMessageIn, type WaStatusIn } from "../../domain/whatsapp";
import { UserError } from "../errors";
import type { ObjectStore } from "../storage";
import { WaError } from "./client";
import type { Gateway } from "./gateway";

// The WhatsApp inbox's data. Admin-only: callers have checked the session, or
// (for ingest) Meta's signature.

type Chat = typeof whatsappChats.$inferSelect;

/** WhatsApp's times are whole seconds: within one, messages go in the order they reached us. */
const newestFirst = [sql`date_trunc('second', ${whatsappMessages.sentAt}) desc`, desc(whatsappMessages.createdAt)];

// ---- receiving ----------------------------------------------------------------

/** The person's chat, matched by Meta's user id or their number, made if new. */
async function chatFor(tx: Db, who: Pick<WaMessageIn, "phone" | "userRef" | "username" | "profileName">): Promise<Chat> {
  const match = or(who.userRef ? eq(whatsappChats.userRef, who.userRef) : undefined, who.phone ? eq(whatsappChats.phone, who.phone) : undefined);
  const found = await tx.select().from(whatsappChats).where(match).orderBy(asc(whatsappChats.createdAt)).for("update");
  if (found.length === 0) {
    const [made] = await tx
      .insert(whatsappChats)
      .values({ phone: who.phone, userRef: who.userRef, username: who.username, profileName: who.profileName })
      .onConflictDoNothing()
      .returning();
    if (made) return made;
    const [raced] = await tx.select().from(whatsappChats).where(match).for("update");
    return raced;
  }
  const [chat, ...rest] = found;
  // Known by id and by number separately until now: make it one conversation.
  for (const other of rest) {
    await tx.update(whatsappMessages).set({ chatId: chat.id }).where(eq(whatsappMessages.chatId, other.id));
    await tx.delete(whatsappChats).where(eq(whatsappChats.id, other.id));
    chat.phone ??= other.phone;
    chat.userRef ??= other.userRef;
    chat.username ??= other.username;
    chat.profileName ??= other.profileName;
    chat.unread += other.unread;
    if (other.lastInboundAt && (!chat.lastInboundAt || other.lastInboundAt > chat.lastInboundAt)) chat.lastInboundAt = other.lastInboundAt;
    if (other.lastMessageAt > chat.lastMessageAt) chat.lastMessageAt = other.lastMessageAt;
  }
  const [updated] = await tx
    .update(whatsappChats)
    .set({
      phone: who.phone ?? chat.phone,
      userRef: who.userRef ?? chat.userRef,
      username: who.username ?? chat.username,
      profileName: who.profileName ?? chat.profileName,
      unread: chat.unread,
      lastInboundAt: chat.lastInboundAt,
      lastMessageAt: chat.lastMessageAt,
    })
    .where(eq(whatsappChats.id, chat.id))
    .returning();
  return updated;
}

/** Saves a webhook's contents. Safe to repeat (Meta retries). Returns messages whose files need copying. */
export async function ingest(db: Db, data: { messages: WaMessageIn[]; statuses: WaStatusIn[] }): Promise<string[]> {
  const files: string[] = [];
  for (const m of data.messages) {
    await db.transaction(async (tx) => {
      const [seen] = await tx.select({ id: whatsappMessages.id }).from(whatsappMessages).where(eq(whatsappMessages.waId, m.waId));
      if (seen) return;
      const chat = await chatFor(tx, m);
      const [row] = await tx
        .insert(whatsappMessages)
        .values({
          chatId: chat.id,
          waId: m.waId,
          direction: m.direction,
          kind: m.kind,
          body: m.body,
          status: m.direction === "in" ? "received" : "sent",
          mediaId: m.media?.id,
          mediaMime: m.media?.mime,
          mediaName: m.media?.name,
          sentAt: m.at,
        })
        .onConflictDoNothing()
        .returning({ id: whatsappMessages.id });
      if (!row) return;
      const later = (a: Date | null) => (a && a > m.at ? a : m.at);
      await tx
        .update(whatsappChats)
        .set({
          lastMessageAt: later(chat.lastMessageAt.getTime() === chat.createdAt.getTime() ? null : chat.lastMessageAt),
          ...(m.direction === "in" ? { lastInboundAt: later(chat.lastInboundAt), unread: chat.unread + 1 } : { unread: 0 }),
        })
        .where(eq(whatsappChats.id, chat.id));
      if (m.media) files.push(row.id);
    });
  }
  for (const s of data.statuses) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(whatsappMessages).where(eq(whatsappMessages.waId, s.waId)).for("update");
      if (!m || m.direction !== "out") return;
      const status = nextStatus(m.status, s.status);
      if (status === m.status) return;
      await tx.update(whatsappMessages).set({ status, error: status === "failed" ? s.error : null }).where(eq(whatsappMessages.id, m.id));
      await touch(tx, m.chatId);
    });
  }
  return files;
}

async function touch(db: Db, chatId: string) {
  await db.update(whatsappChats).set({ updatedAt: new Date() }).where(eq(whatsappChats.id, chatId));
}

/**
 * A received file: our stored copy, or fetched from Meta (and kept, when
 * storage is configured). Null when it can't be had any more.
 */
export async function mediaFile(db: Db, gateway: Gateway | null, store: ObjectStore | null, messageId: string) {
  const [m] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.id, messageId));
  if (!m?.mediaId || !isMediaKind(m.kind)) return null;
  const about = { mime: m.mediaMime ?? "application/octet-stream", name: m.mediaName };
  if (m.mediaKey) {
    const bytes = await store?.get(m.mediaKey);
    if (bytes) return { ...about, bytes };
  }
  if (!gateway) return null;
  const bytes = await gateway.file(m.mediaId).catch(() => null);
  if (!bytes) return null;
  if (store) {
    const key = `whatsapp/${randomUUID()}`;
    await store.put(key, bytes, "application/octet-stream");
    // If the chat was deleted meanwhile, don't leave the file behind.
    const kept = await db.update(whatsappMessages).set({ mediaKey: key }).where(and(eq(whatsappMessages.id, m.id), isNull(whatsappMessages.mediaKey))).returning({ id: whatsappMessages.id });
    if (kept.length === 0) await store.delete(key);
  }
  return { ...about, bytes };
}

// ---- sending --------------------------------------------------------------------

export interface SendTarget {
  chatId: string | null;
  /** Starts a chat with a customer who hasn't written yet. */
  customerId: string | null;
}

async function resolveTarget(db: Db, target: SendTarget): Promise<Chat> {
  if (target.chatId) {
    const [chat] = await db.select().from(whatsappChats).where(eq(whatsappChats.id, target.chatId));
    if (chat) return chat;
  } else if (target.customerId) {
    const [p] = await db
      .select({ phone: customerProfiles.phone })
      .from(customerProfiles)
      .where(and(eq(customerProfiles.userId, target.customerId), isNull(customerProfiles.anonymisedAt)));
    const phone = p?.phone;
    if (phone) return db.transaction((tx) => chatFor(tx, { phone, userRef: null, username: null, profileName: null }));
  }
  throw new UserError("That chat no longer exists. Reload the page.");
}

/**
 * Records the message first, then sends it, so nothing that reached WhatsApp
 * can be missing here. `id` comes from the browser: sending it again is a no-op.
 */
async function deliver(db: Db, adminId: string, chat: Chat, id: string, message: { kind: string; body: string }, post: () => Promise<string>) {
  const now = new Date();
  const [row] = await db
    .insert(whatsappMessages)
    .values({ id, chatId: chat.id, direction: "out", kind: message.kind, body: message.body, status: "sending", sentBy: adminId, sentAt: now })
    .onConflictDoNothing()
    .returning({ id: whatsappMessages.id });
  if (!row) return { chatId: chat.id };
  await db.update(whatsappChats).set({ lastMessageAt: now }).where(eq(whatsappChats.id, chat.id));
  try {
    const waId = await post();
    await db.transaction(async (tx) => {
      // Our own message can come back as a webhook before we know its id: keep one.
      await tx.delete(whatsappMessages).where(and(eq(whatsappMessages.waId, waId), ne(whatsappMessages.id, id)));
      await tx.update(whatsappMessages).set({ waId, status: "sent" }).where(eq(whatsappMessages.id, id));
    });
  } catch (e) {
    const error = e instanceof WaError ? e.message : "Something went wrong, so it may not have been sent.";
    await db.update(whatsappMessages).set({ status: "failed", error }).where(eq(whatsappMessages.id, id));
    if (!(e instanceof WaError)) console.error("[whatsapp] send failed", e);
    throw new UserError(error);
  } finally {
    await touch(db, chat.id);
  }
  return { chatId: chat.id };
}

/** A linked number that sends one text to many people gets banned as spam. */
const SAME_TEXT_LIMIT = 5;
async function refuseBulk(db: Db, chatId: string, text: string, now: Date) {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${whatsappMessages.chatId})::int` })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.direction, "out"), eq(whatsappMessages.body, text), ne(whatsappMessages.chatId, chatId), gt(whatsappMessages.sentAt, new Date(now.getTime() - 3_600_000))));
  if ((row?.n ?? 0) >= SAME_TEXT_LIMIT) throw new UserError(`You've sent that exact message to ${row.n} people this hour. WhatsApp bans numbers for that, so reword it.`);
}

export async function sendText(db: Db, gateway: Gateway, adminId: string, input: SendTarget & { id: string; text: string }, now = new Date()) {
  const chat = await resolveTarget(db, input);
  if (gateway.windowed && !isWindowOpen(chat.lastInboundAt, now)) throw new UserError("More than 24 hours since they last wrote. Send an approved template instead.");
  if (gateway.kind === "evolution") await refuseBulk(db, chat.id, input.text, now);
  return deliver(db, adminId, chat, input.id, { kind: "text", body: input.text }, () => gateway.text(chat, input.text));
}

export async function sendTemplate(db: Db, gateway: Gateway, adminId: string, input: SendTarget & { id: string; name: string; language: string; values: Record<string, string> }) {
  const template = (await gateway.templates().catch(() => [])).find((t) => t.name === input.name && t.language === input.language);
  if (!template) throw new UserError("That template isn't approved on Meta (any more).");
  const values = Object.fromEntries(template.params.map((p) => [p, cleanParam(input.values[p] ?? "")]));
  if (template.params.some((p) => !values[p])) throw new UserError("Fill in every blank.");
  const chat = await resolveTarget(db, input);
  return deliver(db, adminId, chat, input.id, { kind: "template", body: fillTemplate(template.body, values) }, () => gateway.template(chat, template, values));
}

/** Clears the unread count and shows the customer blue ticks (best effort). */
export async function markRead(db: Db, gateway: Gateway | null, chatId: string) {
  const cleared = await db
    .update(whatsappChats)
    .set({ unread: 0 })
    .where(and(eq(whatsappChats.id, chatId), sql`${whatsappChats.unread} > 0`))
    .returning({ phone: whatsappChats.phone, userRef: whatsappChats.userRef });
  if (!gateway || cleared.length === 0) return;
  const [last] = await db
    .select({ waId: whatsappMessages.waId })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.chatId, chatId), eq(whatsappMessages.direction, "in"), isNotNull(whatsappMessages.waId)))
    .orderBy(...newestFirst)
    .limit(1);
  if (last?.waId) await gateway.read(cleared[0], last.waId).catch(() => {});
}

/**
 * Deletes a customer's conversations (PDPA), unless another account uses the same
 * number. Returns the stored files to remove after the commit.
 */
export async function deleteChatsOf(tx: Db, customerId: string): Promise<string[]> {
  const [p] = await tx.select({ phone: customerProfiles.phone }).from(customerProfiles).where(eq(customerProfiles.userId, customerId));
  const phone = p?.phone;
  if (!phone) return [];
  const [shared] = await tx
    .select({ id: customerProfiles.userId })
    .from(customerProfiles)
    .where(and(eq(customerProfiles.phone, phone), ne(customerProfiles.userId, customerId)))
    .limit(1);
  if (shared) return [];
  const files = await tx
    .select({ key: whatsappMessages.mediaKey })
    .from(whatsappMessages)
    .innerJoin(whatsappChats, eq(whatsappChats.id, whatsappMessages.chatId))
    .where(and(eq(whatsappChats.phone, phone), isNotNull(whatsappMessages.mediaKey)));
  await tx.delete(whatsappChats).where(eq(whatsappChats.phone, phone));
  return files.flatMap((f) => f.key ?? []);
}

// ---- reading --------------------------------------------------------------------

/** Changes whenever anything in the inbox does; cheap enough to poll. */
export async function inboxVersion(db: Db): Promise<string> {
  const [row] = await db.select({ at: max(whatsappChats.updatedAt), n: sql<number>`count(*)::int` }).from(whatsappChats);
  return `${row?.n ?? 0}:${row?.at?.getTime() ?? 0}`;
}

export interface ChatListItem {
  key: string;
  chatId: string | null;
  customerId: string | null;
  name: string;
  preview: string;
  fromUs: boolean;
  at: Date | null;
  unread: number;
}

const LIST_LIMIT = 60;

/** Conversations, newest first, then customers with a number who haven't chatted yet. */
export async function listChats(db: Db, q: string): Promise<ChatListItem[]> {
  const like = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const profileMatches = sql`exists(select 1 from ${customerProfiles} p join ${users} u on u.id = p.user_id where p.phone = ${whatsappChats.phone} and (p.display_name ilike ${like} or u.email ilike ${like}))`;
  const lastOrder = sql`(select max(o.created_at) from ${orders} o where o.customer_id = "users"."id")`;
  const [chats, customers] = await Promise.all([
    db
      .select()
      .from(whatsappChats)
      .where(q ? or(ilike(whatsappChats.profileName, like), ilike(whatsappChats.username, like), ilike(whatsappChats.phone, like), profileMatches) : undefined)
      .orderBy(desc(whatsappChats.lastMessageAt))
      .limit(LIST_LIMIT),
    db
      .select({ id: users.id, name: customerProfiles.displayName, phone: customerProfiles.phone })
      .from(customerProfiles)
      .innerJoin(users, eq(users.id, customerProfiles.userId))
      .where(
        and(
          isNotNull(customerProfiles.phone),
          isNull(customerProfiles.anonymisedAt),
          notExists(db.select({ id: whatsappChats.id }).from(whatsappChats).where(eq(whatsappChats.phone, customerProfiles.phone))),
          q ? or(ilike(customerProfiles.displayName, like), ilike(users.email, like), ilike(customerProfiles.phone, like)) : undefined,
        ),
      )
      .orderBy(sql`${lastOrder} desc nulls last`)
      .limit(LIST_LIMIT),
  ]);
  const ids = chats.map((c) => c.id);
  const phones = chats.flatMap((c) => c.phone ?? []);
  const [last, names] = await Promise.all([
    ids.length
      ? db
          .selectDistinctOn([whatsappMessages.chatId], { chatId: whatsappMessages.chatId, kind: whatsappMessages.kind, body: whatsappMessages.body, direction: whatsappMessages.direction })
          .from(whatsappMessages)
          .where(inArray(whatsappMessages.chatId, ids))
          .orderBy(whatsappMessages.chatId, ...newestFirst)
      : [],
    phones.length
      ? db.select({ phone: customerProfiles.phone, name: customerProfiles.displayName }).from(customerProfiles).where(inArray(customerProfiles.phone, phones))
      : [],
  ]);
  return [
    ...chats.map((c): ChatListItem => {
      const m = last.find((x) => x.chatId === c.id);
      return {
        key: c.id,
        chatId: c.id,
        customerId: null,
        name: chatName(c, names.find((n) => n.phone === c.phone)?.name),
        preview: m ? previewOf(m.kind, m.body) : "",
        fromUs: m?.direction === "out",
        at: c.lastMessageAt,
        unread: c.unread,
      };
    }),
    ...customers.map((c): ChatListItem => ({ key: c.id, chatId: null, customerId: c.id, name: c.name, preview: "No messages yet", fromUs: false, at: null, unread: 0 })),
  ];
}

function chatName(c: Pick<Chat, "profileName" | "username" | "phone">, customer?: string | null): string {
  return customer || c.profileName || (c.username ? `@${c.username}` : null) || c.phone || "WhatsApp user";
}

const THREAD_LIMIT = 200;

/** One conversation with its customer and orders, or null. */
export async function getThread(db: Db, target: SendTarget) {
  let chat: Chat | null = null;
  let phone: string | null = null;
  if (target.chatId) {
    [chat = null] = await db.select().from(whatsappChats).where(eq(whatsappChats.id, target.chatId));
    if (!chat) return null;
    phone = chat.phone;
  } else if (target.customerId) {
    const [p] = await db.select({ phone: customerProfiles.phone }).from(customerProfiles).where(and(eq(customerProfiles.userId, target.customerId), isNull(customerProfiles.anonymisedAt)));
    if (!p?.phone) return null;
    phone = p.phone;
    [chat = null] = await db.select().from(whatsappChats).where(eq(whatsappChats.phone, phone));
  } else return null;

  const [messages, people] = await Promise.all([
    chat ? db.select().from(whatsappMessages).where(eq(whatsappMessages.chatId, chat.id)).orderBy(...newestFirst).limit(THREAD_LIMIT) : [],
    // Numbers are typed in by students, so more than one account can have the same one.
    phone
      ? db
          .select({ id: users.id, name: customerProfiles.displayName, email: users.email, campus: customerProfiles.campus })
          .from(customerProfiles)
          .innerJoin(users, eq(users.id, customerProfiles.userId))
          .where(and(eq(customerProfiles.phone, phone), isNull(customerProfiles.anonymisedAt)))
          .orderBy(asc(customerProfiles.displayName))
          .limit(5)
      : [],
  ]);
  const ids = people.map((p) => p.id);
  const [orderRows, totals] = ids.length
    ? await Promise.all([
        db
          .select({
            id: orders.id,
            customerId: orders.customerId,
            itemName: orders.itemName,
            variantText: orders.variantText,
            platform: orders.platform,
            shippingMode: orders.shippingMode,
            status: orders.status,
            trackingNumber: orders.trackingNumber,
            photoKeys: orders.referencePhotoKeys,
            createdAt: orders.createdAt,
            batchCode: batches.code,
            pickupStartsAt: batches.pickupStartsAt,
            pickupEndsAt: batches.pickupEndsAt,
            owedSen: sql<number>`coalesce((select sum(l.amount_sen)::int from ${ledgerEntries} l where l.order_id = "orders"."id"), 0)`,
            quoteSen: sql<number | null>`(select q.total_max_sen from ${quotes} q where q.order_id = "orders"."id" order by q.created_at desc limit 1)`,
          })
          .from(orders)
          .leftJoin(batches, eq(batches.id, orders.batchId))
          .where(inArray(orders.customerId, ids))
          .orderBy(desc(orders.createdAt))
          .limit(20),
        db
          .select({ customerId: ledgerEntries.customerId, sen: sum(ledgerEntries.amountSen).mapWith(Number) })
          .from(ledgerEntries)
          .where(inArray(ledgerEntries.customerId, ids))
          .groupBy(ledgerEntries.customerId),
      ])
    : [[], []];
  return {
    chat,
    phone,
    name: chat ? chatName(chat, people[0]?.name) : (people[0]?.name ?? "Customer"),
    messages: messages.reverse(),
    customers: people.map((p) => ({ ...p, balanceSen: totals.find((t) => t.customerId === p.id)?.sen ?? 0 })),
    orders: orderRows,
  };
}

export type Thread = NonNullable<Awaited<ReturnType<typeof getThread>>>;
