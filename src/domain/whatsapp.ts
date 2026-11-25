// WhatsApp inbox rules, free of I/O: reading Meta's webhooks, the 24-hour reply
// window, delivery ticks and approved templates.
// https://developers.facebook.com/documentation/business-messaging/whatsapp
import { z } from "zod";

export const WA_STATUSES = ["received", "sending", "sent", "delivered", "read", "failed"] as const;
export type WaStatus = (typeof WA_STATUSES)[number];

export const WA_DIRECTIONS = ["in", "out"] as const;
export type WaDirection = (typeof WA_DIRECTIONS)[number];

export const MEDIA_KINDS = ["image", "video", "audio", "document", "sticker"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const isMediaKind = (kind: string): kind is MediaKind => (MEDIA_KINDS as readonly string[]).includes(kind);

/** WhatsApp's own limit for a text message. */
export const MAX_TEXT_LENGTH = 4096;

/** Free-form replies are allowed for 24 hours after the customer's last message. */
export const WINDOW_MS = 24 * 3_600_000;

export function windowClosesAt(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WINDOW_MS) : null;
}

export function isWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
  const closes = windowClosesAt(lastInboundAt);
  return closes !== null && closes > now;
}

const RANK: Record<WaStatus, number> = { received: 0, sending: 1, sent: 2, failed: 3, delivered: 4, read: 5 };

/** Webhooks can arrive late or out of order: a message only ever moves forward. */
export function nextStatus(current: WaStatus, incoming: WaStatus): WaStatus {
  return RANK[incoming] > RANK[current] ? incoming : current;
}

// ---- webhooks ---------------------------------------------------------------

export interface WaMessageIn {
  waId: string;
  direction: WaDirection;
  /** E.164, when WhatsApp shares it (people with a username may have none). */
  phone: string | null;
  /** Meta's id for this person and our business; survives without a phone number. */
  userRef: string | null;
  username: string | null;
  profileName: string | null;
  kind: string;
  body: string | null;
  media: { id: string; mime: string; name: string | null } | null;
  at: Date;
}

export interface WaStatusIn {
  waId: string;
  status: WaStatus;
  error: string | null;
}

const str = z.string().max(200).optional();
const text = z.string().max(65_536).optional();
const media = z.object({ id: z.string().max(200), mime_type: z.string().max(200).optional(), filename: z.string().max(300).optional(), caption: text }).optional();

const messageSchema = z.object({
  id: z.string().min(1).max(300),
  from: str,
  from_user_id: str,
  to: str,
  to_user_id: str,
  timestamp: z.coerce.number().int().positive(),
  type: z.string().max(40),
  text: z.object({ body: text }).optional(),
  image: media,
  video: media,
  audio: media,
  document: media,
  sticker: media,
  button: z.object({ text }).optional(),
  interactive: z.object({ button_reply: z.object({ title: text }).optional(), list_reply: z.object({ title: text }).optional() }).optional(),
  reaction: z.object({ emoji: text }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number(), name: text, address: text }).optional(),
});

const statusSchema = z.object({
  id: z.string().min(1).max(300),
  status: z.string().max(40),
  errors: z.array(z.object({ code: z.number(), title: text, error_data: z.object({ details: text }).optional() })).optional(),
});

const contactSchema = z.object({
  wa_id: str,
  user_id: str,
  profile: z.object({ name: text, username: text }).optional(),
});

const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z.array(z.unknown()).optional(),
            messages: z.array(z.unknown()).optional(),
            message_echoes: z.array(z.unknown()).optional(),
            statuses: z.array(z.unknown()).optional(),
          }),
        }),
      ),
    }),
  ),
});

type RawMessage = z.infer<typeof messageSchema>;

export function toE164(waId: string | undefined): string | null {
  const digits = (waId ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

function bodyOf(m: RawMessage): string | null {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "reaction":
      return m.reaction?.emoji ?? null;
    case "location":
      return m.location ? [m.location.name, m.location.address, `${m.location.latitude}, ${m.location.longitude}`].filter(Boolean).join("\n") : null;
    default:
      return isMediaKind(m.type) ? (m[m.type]?.caption ?? null) : null;
  }
}

/**
 * The messages and delivery updates in a webhook meant for `phoneNumberId`.
 * Each item is checked on its own, so one Meta adds a new shape to doesn't
 * lose the rest of the batch.
 */
export function parseWebhook(payload: unknown, phoneNumberId: string): { messages: WaMessageIn[]; statuses: WaStatusIn[] } {
  const out = { messages: [] as WaMessageIn[], statuses: [] as WaStatusIn[] };
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return out;

  for (const { changes } of parsed.data.entry) {
    for (const { field, value } of changes) {
      if (value.metadata?.phone_number_id !== phoneNumberId) continue;
      const contacts = (value.contacts ?? []).flatMap((c) => contactSchema.safeParse(c).data ?? []);

      const add = (raw: unknown, direction: WaDirection) => {
        const m = messageSchema.safeParse(raw).data;
        if (!m) return;
        const number = direction === "in" ? m.from : m.to;
        const ref = direction === "in" ? m.from_user_id : m.to_user_id;
        const contact = contacts.find((c) => (number && c.wa_id === number) || (ref && c.user_id === ref));
        const phone = toE164(number ?? contact?.wa_id);
        const userRef = ref ?? contact?.user_id ?? null;
        if (!phone && !userRef) return;
        const file = isMediaKind(m.type) ? m[m.type] : undefined;
        out.messages.push({
          waId: m.id,
          direction,
          phone,
          userRef,
          username: contact?.profile?.username?.slice(0, 100) ?? null,
          profileName: contact?.profile?.name?.slice(0, 200) ?? null,
          kind: m.type,
          body: bodyOf(m)?.replaceAll("\0", "").slice(0, MAX_TEXT_LENGTH) ?? null,
          media: file ? { id: file.id, mime: (file.mime_type ?? "application/octet-stream").split(";")[0].trim().toLowerCase(), name: file.filename ?? null } : null,
          at: new Date(m.timestamp * 1000),
        });
      };
      if (field === "messages") for (const m of value.messages ?? []) add(m, "in");
      // Replies typed in the WhatsApp Business app, when the number is used in both.
      if (field === "smb_message_echoes") for (const m of value.message_echoes ?? []) add(m, "out");

      for (const raw of value.statuses ?? []) {
        const s = statusSchema.safeParse(raw).data;
        if (!s || !["sent", "delivered", "read", "failed"].includes(s.status)) continue;
        const e = s.errors?.[0];
        out.statuses.push({ waId: s.id, status: s.status as WaStatus, error: e ? sendError(e.code, e.error_data?.details ?? e.title) : null });
      }
    }
  }
  return out;
}

/** Meta's error codes as something the admin can act on. */
export function sendError(code: number | undefined, detail?: string): string {
  switch (code) {
    case 131047:
      return "More than 24 hours since they last wrote. Send an approved template instead.";
    case 131026:
      return "WhatsApp couldn't deliver it. They may not use WhatsApp, or need to update the app.";
    case 131042:
      return "Meta couldn't charge for this message. Add a payment method in Meta Billing.";
    case 190:
      return "Meta no longer accepts the access token. Create a new one.";
    case 130429:
    case 131048:
    case 131056:
      return "Too many messages at once. Wait a little, then try again.";
    case 132000:
    case 132001:
    case 132012:
    case 132015:
      return "Meta refused that template. Check it's approved and every blank is filled.";
  }
  return detail ? `WhatsApp refused it: ${detail.slice(0, 200)}` : "WhatsApp refused it. Try again.";
}

// ---- display ----------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice message",
  document: "Document",
  sticker: "Sticker",
  location: "Location",
  contacts: "Contact",
  reaction: "Reaction",
  view_once: "View-once message (open it on the phone)",
};

/** One line for the chat list. */
export function previewOf(kind: string, body: string | null): string {
  const label = KIND_LABELS[kind];
  const line = body?.replace(/\s+/g, " ").trim();
  if (kind === "text" || kind === "template" || kind === "button" || kind === "interactive") return line || "Message";
  if (!label) return "Unsupported message";
  return line && kind !== "location" ? `${label}: ${line}` : label;
}

/** Image types shown in the chat; anything else a browser could run is only ever downloaded. */
const INLINE_MIME = /^(?:image\/(?:jpeg|png|webp)|audio\/(?:ogg|mpeg|mp4|aac|amr)|video\/(?:mp4|3gpp))$/;
export const isInlineMime = (mime: string) => INLINE_MIME.test(mime);

// ---- approved templates -------------------------------------------------------

export interface WaTemplate {
  name: string;
  language: string;
  body: string;
  named: boolean;
  params: string[];
}

const templateSchema = z.object({
  name: z.string(),
  language: z.string(),
  status: z.string(),
  parameter_format: z.string().optional(),
  components: z.array(z.object({ type: z.string(), format: z.string().optional(), text: z.string().optional(), buttons: z.array(z.object({ type: z.string(), url: z.string().optional() })).optional() })),
});

const BLANK = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** Approved templates the composer can fill: blanks only in the body, no media header. */
export function usableTemplates(data: unknown): WaTemplate[] {
  return z
    .array(z.unknown())
    .catch([])
    .parse(data)
    .flatMap((raw): WaTemplate[] => {
      const t = templateSchema.safeParse(raw).data;
      if (!t || t.status !== "APPROVED") return [];
      const has = (type: string) => t.components.find((c) => c.type === type);
      const header = has("HEADER");
      if (header && (header.format !== "TEXT" || header.text?.includes("{{"))) return [];
      if (has("BUTTONS")?.buttons?.some((b) => b.url?.includes("{{") || ["OTP", "COPY_CODE", "FLOW", "CATALOG", "MPM"].includes(b.type))) return [];
      const body = has("BODY")?.text;
      if (!body) return [];
      const params = [...new Set([...body.matchAll(BLANK)].map((m) => m[1]))];
      return [{ name: t.name, language: t.language, body, named: t.parameter_format?.toUpperCase() === "NAMED", params }];
    });
}

/** Meta refuses line breaks and runs of spaces inside a blank. */
export const cleanParam = (v: string) => v.replace(/\s+/g, " ").trim();

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(BLANK, (_, name: string) => cleanParam(values[name] ?? ""));
}
