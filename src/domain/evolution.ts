// Reading Evolution API's webhooks (v2.3, WhatsApp linked as a device) into the
// same shapes as Meta's. Only one-to-one chats: groups, statuses and channels
// are dropped here too, whatever Evolution is set to send.
import { z } from "zod";
import { MAX_TEXT_LENGTH, toE164, type WaMessageIn, type WaStatusIn } from "./whatsapp";

const text = z.string().max(65_536).nullish();
/** A number, a numeric string, or protobuf's split 64-bit form. */
const size = z
  .union([z.number(), z.string().transform(Number), z.object({ low: z.number(), high: z.number() }).transform((v) => v.high * 2 ** 32 + (v.low >>> 0))])
  .nullish()
  .catch(undefined);
const file = z.object({ mimetype: z.string().max(200).nullish(), fileName: z.string().max(300).nullish().catch(undefined), caption: text, fileLength: size }).nullish();

const messageSchema = z.object({
  key: z.object({ id: z.string().min(1).max(300), remoteJid: z.string().max(200), remoteJidAlt: z.string().max(200).nullish(), fromMe: z.boolean() }),
  pushName: z.string().nullish(),
  messageType: z.string().max(60).nullish(),
  messageTimestamp: z.coerce.number().int().positive(),
  message: z
    .object({
      conversation: text,
      imageMessage: file,
      videoMessage: file,
      ptvMessage: file,
      audioMessage: file,
      documentMessage: file,
      stickerMessage: file,
      locationMessage: z.object({ degreesLatitude: z.number(), degreesLongitude: z.number(), name: text, address: text }).nullish(),
      contactMessage: z.object({ displayName: text }).nullish(),
      reactionMessage: z.object({ text }).nullish(),
      viewOnceMessage: z.unknown().optional(),
      viewOnceMessageV2: z.unknown().optional(),
    })
    .nullish(),
});

const updateSchema = z.object({ keyId: z.string().min(1).max(300), fromMe: z.boolean(), status: z.string().max(40) });

const payloadSchema = z.object({ event: z.string(), instance: z.string(), data: z.unknown() });

/** Disappearing messages arrive wrapped in another message. */
function unwrap(raw: unknown): unknown {
  const inner = z.object({ message: z.object({ ephemeralMessage: z.object({ message: z.record(z.string(), z.unknown()) }) }) }).safeParse(raw).data;
  if (!inner) return raw;
  const message = inner.message.ephemeralMessage.message;
  const extended = z.object({ extendedTextMessage: z.object({ text: z.string() }) }).safeParse(message).data;
  return { ...(raw as object), message: extended ? { conversation: extended.extendedTextMessage.text } : message };
}

/** Bigger files stay on the phone. */
export const FILE_MAX_BYTES = 16 * 1024 * 1024;

const FILES = { imageMessage: "image", videoMessage: "video", ptvMessage: "video", audioMessage: "audio", documentMessage: "document", stickerMessage: "sticker" } as const;

function contentOf(m: z.infer<typeof messageSchema>): Pick<WaMessageIn, "kind" | "body" | "media"> | null {
  const c = m.message;
  if (!c) return null;
  for (const [field, kind] of Object.entries(FILES) as Array<[keyof typeof FILES, (typeof FILES)[keyof typeof FILES]]>) {
    const f = c[field];
    if (!f) continue;
    const fits = f.fileLength == null || f.fileLength <= FILE_MAX_BYTES;
    const mime = (f.mimetype ?? "application/octet-stream").split(";")[0].trim().toLowerCase();
    return { kind, body: f.caption ?? null, media: fits ? { id: m.key.id, mime, name: f.fileName ?? null } : null };
  }
  if (typeof c.conversation === "string") return { kind: "text", body: c.conversation, media: null };
  if (c.locationMessage) {
    const l = c.locationMessage;
    return { kind: "location", body: [l.name, l.address, `${l.degreesLatitude}, ${l.degreesLongitude}`].filter(Boolean).join("\n"), media: null };
  }
  if (c.reactionMessage) return c.reactionMessage.text ? { kind: "reaction", body: c.reactionMessage.text, media: null } : null;
  if (c.contactMessage) return { kind: "contacts", body: c.contactMessage.displayName ?? null, media: null };
  // Sent to be seen once: noted, never copied.
  if (c.viewOnceMessage || c.viewOnceMessageV2) return { kind: "view_once", body: null, media: null };
  // Polls, lists and so on. WhatsApp's own bookkeeping (protocol, keys) isn't a message.
  return m.messageType && !/^(?:protocol|senderKey|messageContextInfo|unknown|editedMessage)/.test(m.messageType) ? { kind: "other", body: null, media: null } : null;
}

const STATUS: Record<string, WaStatusIn["status"]> = { SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read", ERROR: "failed" };

const phoneOf = (jid: string | null | undefined) => (jid && /^\d+(?::\d+)?@s\.whatsapp\.net$/.test(jid) ? toE164(jid.split(/[:@]/)[0]) : null);
const lidOf = (jid: string | null | undefined) => (jid && /^\d+(?::\d+)?@lid$/.test(jid) ? `${jid.split(/[:@]/)[0]}@lid` : null);

export function parseEvolution(payload: unknown, instance: string): { messages: WaMessageIn[]; statuses: WaStatusIn[] } {
  const out = { messages: [] as WaMessageIn[], statuses: [] as WaStatusIn[] };
  const p = payloadSchema.safeParse(payload).data;
  if (!p || p.instance !== instance) return out;

  if (p.event === "messages.upsert") {
    for (const raw of Array.isArray(p.data) ? p.data : [p.data]) {
      const m = messageSchema.safeParse(unwrap(raw)).data;
      const content = m && contentOf(m);
      if (!m || !content) continue;
      const phone = phoneOf(m.key.remoteJid) ?? phoneOf(m.key.remoteJidAlt);
      const userRef = lidOf(m.key.remoteJid) ?? lidOf(m.key.remoteJidAlt);
      if (!phone && !userRef) continue;
      out.messages.push({
        waId: m.key.id,
        direction: m.key.fromMe ? "out" : "in",
        phone,
        userRef,
        username: null,
        // On our own messages it's our name, not theirs.
        profileName: m.key.fromMe ? null : (m.pushName?.replaceAll("\0", "").slice(0, 200) ?? null),
        ...content,
        body: content.body?.replaceAll("\0", "").slice(0, MAX_TEXT_LENGTH) ?? null,
        at: new Date(m.messageTimestamp * 1000),
      });
    }
  }
  if (p.event === "messages.update") {
    for (const raw of Array.isArray(p.data) ? p.data : [p.data]) {
      const u = updateSchema.safeParse(raw).data;
      const status = u?.fromMe ? STATUS[u.status] : undefined;
      if (u && status) out.statuses.push({ waId: u.keyId, status, error: status === "failed" ? "WhatsApp couldn't deliver it." : null });
    }
  }
  return out;
}
