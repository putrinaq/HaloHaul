// The WhatsApp inbox on a real (in-process) Postgres, with Meta's API faked.
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { customerProfiles, users, whatsappChats, whatsappMessages } from "../../db/schema";
import { createTestDb, type TestDb } from "../../db/testing";
import type { WaMessageIn } from "../../domain/whatsapp";
import { anonymiseCustomer } from "../admin/customers";
import { MemoryStore } from "../storage";
import { downloadMedia, validSignature, type WaConfig } from "./client";
import { evolutionGateway, metaGateway } from "./gateway";
import { startLink, unlink, validWebhook, webhookSecret, type EvoConfig } from "./evolution";
import { getThread, inboxVersion, ingest, listChats, markRead, mediaFile, sendTemplate, sendText } from "./inbox";

const AINA = "studentAina0001";
const TWIN = "studentTwin0001";
const ADMIN = "adminUserId0001";
const PHONE = "+60123456789";
const config: WaConfig = { phoneNumberId: "PN1", businessAccountId: "WABA1", accessToken: "token", appSecret: "secret", verifyToken: "v", graphUrl: "https://graph.test/v1" };
const meta = metaGateway(config);
const evoConfig: EvoConfig = { url: "http://evo.test", apiKey: "evo-key", webhookUrl: "http://app.test/hook" };
const evo = evolutionGateway(evoConfig);

let db: TestDb;
let close: () => Promise<void>;
const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
let reply: (url: string) => Response;

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let n = 0;
const incoming = (over: Partial<WaMessageIn> = {}): WaMessageIn => ({
  waId: `wamid.in${++n}`,
  direction: "in",
  phone: PHONE,
  userRef: null,
  username: null,
  profileName: "Aina WA",
  kind: "text",
  body: "Hi",
  media: null,
  at: new Date(),
  ...over,
});
const receive = (...messages: WaMessageIn[]) => ingest(db, { messages, statuses: [] });
const theChat = async () => (await db.select().from(whatsappChats))[0];

beforeAll(async () => {
  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  await db.insert(users).values([
    { id: AINA, name: "Aina", email: "aina@example.com" },
    { id: TWIN, name: "Twin", email: "twin@example.com" },
    { id: ADMIN, name: "Admin", email: "admin@example.com", role: "admin" },
  ]);
  await db.insert(customerProfiles).values({ userId: AINA, displayName: "Aina Student", phone: PHONE });
});
afterAll(() => close());

beforeEach(() => {
  calls.length = 0;
  reply = () => jsonRes({ messages: [{ id: `wamid.out${++n}` }] });
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return reply(String(url));
  });
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db.delete(whatsappChats);
});

describe("receiving", () => {
  it("saves a message once, however often Meta sends it", async () => {
    const m = incoming();
    await receive(m);
    await receive(m);
    expect(await db.select().from(whatsappMessages)).toHaveLength(1);
    expect(await theChat()).toMatchObject({ phone: PHONE, unread: 1, profileName: "Aina WA" });
  });

  it("keeps the newest times when messages arrive out of order", async () => {
    const late = new Date("2026-11-25T10:00:00Z");
    await receive(incoming({ at: late }));
    await receive(incoming({ at: new Date("2026-11-25T09:00:00Z") }));
    const chat = await theChat();
    expect(chat.lastInboundAt).toEqual(late);
    expect(chat.lastMessageAt).toEqual(late);
    expect(chat.unread).toBe(2);
  });

  it("joins a chat known only by Meta's id to the one known by number", async () => {
    await receive(incoming({ phone: PHONE }));
    await receive(incoming({ phone: null, userRef: "MY.1", username: "aina.x" }));
    expect(await db.select().from(whatsappChats)).toHaveLength(2);
    await receive(incoming({ phone: PHONE, userRef: "MY.1" }));
    const chats = await db.select().from(whatsappChats);
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ phone: PHONE, userRef: "MY.1", username: "aina.x", unread: 3 });
    expect(await db.select().from(whatsappMessages)).toHaveLength(3);
  });

  it("moves delivery ticks forward only, and the version changes", async () => {
    await receive(incoming());
    const { chatId } = await sendText(db, meta, ADMIN, { chatId: (await theChat()).id, customerId: null, id: randomUUID(), text: "Hello" });
    const [out] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.direction, "out"));
    const before = await inboxVersion(db);
    await new Promise((r) => setTimeout(r, 5));
    await ingest(db, { messages: [], statuses: [{ waId: out.waId!, status: "read", error: null }] });
    await ingest(db, { messages: [], statuses: [{ waId: out.waId!, status: "delivered", error: null }] });
    const [after] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.id, out.id));
    expect(after.status).toBe("read");
    expect(await inboxVersion(db)).not.toBe(before);
    expect(chatId).toBe(out.chatId);
  });

  it("only believes webhooks signed with the app secret", () => {
    const body = '{"a":"é"}';
    const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(validSignature(config, body, good)).toBe(true);
    expect(validSignature(config, `${body} `, good)).toBe(false);
    for (const bad of [null, "", "sha256=", good.slice(0, -1), good.replace("sha256=", "")]) expect(validSignature(config, body, bad)).toBe(false);
  });
});

describe("sending", () => {
  it("replies within 24 hours, and only once per message id", async () => {
    await receive(incoming());
    const input = { chatId: (await theChat()).id, customerId: null, id: randomUUID(), text: "Sure!" };
    await sendText(db, meta, ADMIN, input);
    await sendText(db, meta, ADMIN, input);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://graph.test/v1/PN1/messages", body: { to: PHONE, type: "text", text: { body: "Sure!" } } });
    const [out] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.direction, "out"));
    expect(out).toMatchObject({ status: "sent", body: "Sure!", sentBy: ADMIN });
  });

  it("refuses free text after 24 hours without calling Meta", async () => {
    await receive(incoming({ at: new Date(Date.now() - 25 * 3_600_000) }));
    await expect(sendText(db, meta, ADMIN, { chatId: (await theChat()).id, customerId: null, id: randomUUID(), text: "Late" })).rejects.toThrow(/24 hours/);
    expect(calls).toHaveLength(0);
  });

  it("keeps a failed message on record with the reason", async () => {
    await receive(incoming());
    reply = () => jsonRes({ error: { code: 190, message: "expired" } }, 401);
    await expect(sendText(db, meta, ADMIN, { chatId: (await theChat()).id, customerId: null, id: randomUUID(), text: "Hello" })).rejects.toThrow(/access token/);
    const [out] = await db.select().from(whatsappMessages).where(eq(whatsappMessages.direction, "out"));
    expect(out).toMatchObject({ status: "failed", waId: null });
    expect(out.error).toMatch(/access token/);
  });

  it("uses Meta's id for someone who hides their number", async () => {
    await receive(incoming({ phone: null, userRef: "MY.77" }));
    await sendText(db, meta, ADMIN, { chatId: (await theChat()).id, customerId: null, id: randomUUID(), text: "Hi" });
    expect(calls[0].body).toMatchObject({ recipient: "MY.77" });
    expect(calls[0].body).not.toHaveProperty("to");
  });

  it("starts a chat with a customer using an approved template", async () => {
    reply = (url) =>
      url.includes("message_templates")
        ? jsonRes({ data: [{ name: "quote_ready", language: "en", status: "APPROVED", parameter_format: "NAMED", components: [{ type: "BODY", text: "Hi {{name}}, {{order}} is ready." }] }] })
        : jsonRes({ messages: [{ id: "wamid.tpl" }] });
    const send = (values: Record<string, string>) => sendTemplate(db, meta, ADMIN, { chatId: null, customerId: AINA, id: randomUUID(), name: "quote_ready", language: "en", values });
    await expect(send({ name: "Aina" })).rejects.toThrow(/every blank/);
    expect(await db.select().from(whatsappChats)).toHaveLength(0);
    await send({ name: "Aina", order: "#1\n001" });
    expect(calls.at(-1)?.body).toMatchObject({
      to: PHONE,
      template: { name: "quote_ready", components: [{ parameters: [{ parameter_name: "name", text: "Aina" }, { parameter_name: "order", text: "#1 001" }] }] },
    });
    const [out] = await db.select().from(whatsappMessages);
    expect(out).toMatchObject({ kind: "template", body: "Hi Aina, #1 001 is ready." });
    await expect(sendTemplate(db, meta, ADMIN, { chatId: null, customerId: AINA, id: randomUUID(), name: "nope", language: "en", values: {} })).rejects.toThrow(/approved/);
  });
});

describe("reading", () => {
  it("lists chats under the customer's name, then customers who haven't written", async () => {
    expect(await listChats(db, "")).toMatchObject([{ chatId: null, customerId: AINA, name: "Aina Student" }]);
    await receive(incoming({ body: "Is it here?" }), incoming({ phone: "+60199999999", profileName: "Stranger", body: "Hello" }));
    const all = await listChats(db, "");
    expect(all.map((c) => c.name).sort()).toEqual(["Aina Student", "Stranger"]);
    expect(all.every((c) => c.chatId)).toBe(true);
    expect((await listChats(db, "aina@example")).map((c) => c.name)).toEqual(["Aina Student"]);
    expect(await listChats(db, "100%")).toEqual([]);
  });

  it("puts a reply after our message when both fall in the same second", async () => {
    const second = Math.floor(Date.now() / 1000) * 1000;
    await receive(incoming({ body: "First", at: new Date(second - 5000) }));
    const id = (await theChat()).id;
    const ours = randomUUID();
    await sendText(db, meta, ADMIN, { chatId: id, customerId: null, id: ours, text: "Ours" });
    await db.update(whatsappMessages).set({ sentAt: new Date(second + 900) }).where(eq(whatsappMessages.id, ours));
    await receive(incoming({ body: "Reply", at: new Date(second) }));
    expect((await getThread(db, { chatId: id, customerId: null }))?.messages.map((m) => m.body)).toEqual(["First", "Ours", "Reply"]);
    expect((await listChats(db, ""))[0]).toMatchObject({ preview: "Reply", fromUs: false });
  });

  it("opens a thread by chat or by customer, and flags a shared number", async () => {
    await receive(incoming());
    const id = (await theChat()).id;
    expect((await getThread(db, { chatId: null, customerId: AINA }))?.chat?.id).toBe(id);
    await db.insert(customerProfiles).values({ userId: TWIN, displayName: "Twin", phone: PHONE });
    expect((await getThread(db, { chatId: id, customerId: null }))?.customers).toHaveLength(2);
    await db.delete(customerProfiles).where(eq(customerProfiles.userId, TWIN));
    expect(await getThread(db, { chatId: randomUUID(), customerId: null })).toBeNull();
  });

  it("marks read once and sends the blue ticks for the last message", async () => {
    const last = incoming({ at: new Date(Date.now() + 1000) });
    await receive(incoming(), last);
    const id = (await theChat()).id;
    await markRead(db, meta, id);
    await markRead(db, meta, id);
    expect((await theChat()).unread).toBe(0);
    expect(calls.map((c) => c.body)).toEqual([{ messaging_product: "whatsapp", status: "read", message_id: last.waId }]);
  });
});

describe("files", () => {
  const photo = () => incoming({ kind: "image", body: null, media: { id: "M1", mime: "image/jpeg", name: null } });

  it("copies a received file to private storage and serves the copy", async () => {
    const store = new MemoryStore();
    const [id] = await receive(photo());
    reply = (url) => (url.endsWith("/M1") ? jsonRes({ url: "https://lookaside.fbsbx.com/file" }) : new Response(new Uint8Array([1, 2, 3])));
    expect((await mediaFile(db, meta, store, id))?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(store.objects.size).toBe(1);
    calls.length = 0;
    expect((await mediaFile(db, null, store, id))?.mime).toBe("image/jpeg");
    expect(calls).toHaveLength(0);
  });

  it("never sends the access token to a host that isn't Meta's", async () => {
    for (const url of ["https://evil.example/file", "https://fbsbx.com.evil.example/x", "http://lookaside.fbsbx.com/x", "not a url"]) {
      calls.length = 0;
      reply = () => jsonRes({ url });
      expect(await downloadMedia(config, "M1")).toBeNull();
      expect(calls).toHaveLength(1);
    }
    calls.length = 0;
    expect(await downloadMedia(config, "../PN1/messages")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("deleting a customer", () => {
  it("removes their chat and files, unless another account has the same number", async () => {
    const store = new MemoryStore();
    const [id] = await receive(incoming({ kind: "image", media: { id: "M1", mime: "image/jpeg", name: null } }));
    reply = (url) => (url.endsWith("/M1") ? jsonRes({ url: "https://lookaside.fbsbx.com/file" }) : new Response(new Uint8Array([1])));
    await mediaFile(db, meta, store, id);

    await db.insert(customerProfiles).values({ userId: TWIN, displayName: "Twin", phone: PHONE });
    await anonymiseCustomer(db, ADMIN, TWIN, store);
    expect(await db.select().from(whatsappChats)).toHaveLength(1);

    await anonymiseCustomer(db, ADMIN, AINA, store);
    expect(await db.select().from(whatsappChats)).toHaveLength(0);
    expect(await db.select().from(whatsappMessages)).toHaveLength(0);
    expect(store.objects.size).toBe(0);
  });
});

describe("a linked device (Evolution API)", () => {
  const target = async () => ({ chatId: (await theChat()).id, customerId: null, id: randomUUID() });

  it("sends at any time, by number or by hidden id", async () => {
    reply = () => jsonRes({ key: { id: `3EB0${++n}` } }, 201);
    await receive(incoming({ at: new Date(Date.now() - 72 * 3_600_000) }));
    await sendText(db, evo, ADMIN, { ...(await target()), text: "Still there?" });
    expect(calls[0]).toMatchObject({ url: "http://evo.test/message/sendText/halohaul", body: { number: "60123456789", text: "Still there?" } });
    await db.delete(whatsappChats);
    await receive(incoming({ phone: null, userRef: "999@lid" }));
    await sendText(db, evo, ADMIN, { ...(await target()), text: "Hi" });
    expect(calls[1].body).toMatchObject({ number: "999@lid" });
  });

  it("keeps one copy when its own message comes back first", async () => {
    await receive(incoming());
    reply = () => jsonRes({ key: { id: "3EB0ECHO" } }, 201);
    const input = { ...(await target()), text: "Hello" };
    const slow = { ...evo, text: async (...a: Parameters<typeof evo.text>) => {
      const id = await evo.text(...a);
      await receive(incoming({ waId: id, direction: "out", body: "Hello" }));
      return id;
    } };
    await sendText(db, slow, ADMIN, input);
    const out = await db.select().from(whatsappMessages).where(eq(whatsappMessages.direction, "out"));
    expect(out).toMatchObject([{ id: input.id, waId: "3EB0ECHO", status: "sent" }]);
  });

  it("explains a number that isn't on WhatsApp, and a lost link", async () => {
    await receive(incoming());
    reply = () => jsonRes({ status: 400, response: { message: [{ exists: false, number: "60123456789" }] } }, 400);
    await expect(sendText(db, evo, ADMIN, { ...(await target()), text: "a" })).rejects.toThrow(/isn't on WhatsApp/);
    reply = () => jsonRes({ status: 400, response: { message: ["Error: Connection Closed"] } }, 400);
    await expect(sendText(db, evo, ADMIN, { ...(await target()), text: "b" })).rejects.toThrow(/disconnected/);
  });

  it("refuses the same text to a sixth person within the hour", async () => {
    reply = () => jsonRes({ key: { id: `3EB0${++n}` } }, 201);
    for (let i = 0; i < 6; i++) await receive(incoming({ phone: `+6019000000${i}` }));
    const chats = await db.select().from(whatsappChats);
    const send = (chatId: string, text: string) => sendText(db, evo, ADMIN, { chatId, customerId: null, id: randomUUID(), text });
    for (const chat of chats.slice(0, 5)) await send(chat.id, "SALE!");
    await expect(send(chats[5].id, "SALE!")).rejects.toThrow(/5 people/);
    await send(chats[5].id, "Your order is here, Wei");
  });

  it("links with a QR code, sending webhooks only to us", async () => {
    let state = 404;
    reply = (url) => {
      if (url.includes("connectionState")) return state === 404 ? jsonRes({}, 404) : jsonRes({ instance: { state: "connecting" } });
      if (url.endsWith("/instance/create")) state = 200;
      return jsonRes(url.includes("/instance/connect/") ? { base64: "data:image/png;base64,AAAA" } : {});
    };
    expect(await startLink(evoConfig)).toEqual({ state: "connecting", qr: "data:image/png;base64,AAAA" });
    const created = calls.find((c) => c.url.endsWith("/instance/create"))?.body as { webhook: { url: string; headers: { authorization: string } }; groupsIgnore: boolean };
    expect(created).toMatchObject({ groupsIgnore: true, webhook: { url: "http://app.test/hook", base64: false } });
    expect(validWebhook(evoConfig, created.webhook.headers.authorization)).toBe(true);
    expect(validWebhook(evoConfig, "Bearer evo-key")).toBe(false);
    expect(validWebhook(evoConfig, null)).toBe(false);
    expect(webhookSecret(evoConfig)).not.toContain("evo-key");
  });

  it("says when the service isn't running, and unlinking twice is fine", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await startLink(evoConfig)).toEqual({ state: "unreachable", qr: null });
    vi.stubGlobal("fetch", async () => jsonRes({}, 404));
    await unlink(evoConfig);
  });

  it("fetches files and marks messages read", async () => {
    const [id] = await receive(incoming({ kind: "image", media: { id: "3A01", mime: "image/jpeg", name: null } }));
    reply = (url) => jsonRes(url.includes("getBase64") ? { base64: Buffer.from([9, 8]).toString("base64") } : {}, 201);
    expect((await mediaFile(db, evo, null, id))?.bytes).toEqual(new Uint8Array([9, 8]));
    await markRead(db, evo, (await theChat()).id);
    expect(calls.at(-1)?.body).toMatchObject({ readMessages: [{ remoteJid: "60123456789@s.whatsapp.net", fromMe: false }] });
  });
});
