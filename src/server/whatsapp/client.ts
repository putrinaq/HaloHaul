import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sendError, usableTemplates, type WaTemplate } from "../../domain/whatsapp";
import { env } from "../env";

// Meta's WhatsApp Cloud API. Nothing here touches the database.

export interface WaConfig {
  phoneNumberId: string;
  businessAccountId: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  graphUrl: string;
}

/** Null until the WhatsApp settings are in the environment. */
export function whatsappConfig(): WaConfig | null {
  const e = env();
  if (!e.WHATSAPP_PHONE_NUMBER_ID || !e.WHATSAPP_ACCESS_TOKEN || !e.WHATSAPP_APP_SECRET || !e.WHATSAPP_VERIFY_TOKEN) return null;
  return {
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: e.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    accessToken: e.WHATSAPP_ACCESS_TOKEN,
    appSecret: e.WHATSAPP_APP_SECRET,
    verifyToken: e.WHATSAPP_VERIFY_TOKEN,
    graphUrl: e.WHATSAPP_GRAPH_URL,
  };
}

export function safeEqual(a: string, b: string): boolean {
  const x = createHmac("sha256", "compare").update(a).digest();
  const y = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Meta signs the exact bytes of each webhook with the app secret. */
export function validSignature(config: WaConfig, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  return safeEqual(`sha256=${createHmac("sha256", config.appSecret).update(rawBody, "utf8").digest("hex")}`, header);
}

export class WaError extends Error {}

const errorBody = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional(), error_data: z.object({ details: z.string().optional() }).optional() }) });

async function graph(config: WaConfig, path: string, init?: { method: "POST"; body: unknown }): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${config.graphUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${config.accessToken}`, ...(init ? { "content-type": "application/json" } : {}) },
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new WaError("Couldn't reach WhatsApp, so it may not have been sent. Check with them before sending again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = errorBody.safeParse(json).data?.error;
    throw new WaError(sendError(e?.code, e?.error_data?.details ?? e?.message));
  }
  return json;
}

export interface Recipient {
  phone: string | null;
  userRef: string | null;
}

async function post(config: WaConfig, to: Recipient, message: Record<string, unknown>): Promise<string> {
  // A phone number wins; Meta's user id reaches people who hide theirs.
  const target = to.phone ? { to: to.phone } : { recipient: to.userRef };
  const json = await graph(config, `/${config.phoneNumberId}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", ...target, ...message },
  });
  const id = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) }).safeParse(json).data?.messages[0].id;
  if (!id) throw new WaError("WhatsApp gave an unexpected answer, so it may not have been sent.");
  return id;
}

export const postText = (config: WaConfig, to: Recipient, body: string) => post(config, to, { type: "text", text: { body, preview_url: true } });

export function postTemplate(config: WaConfig, to: Recipient, template: WaTemplate, values: Record<string, string>) {
  const parameters = template.params.map((p) => ({ type: "text", ...(template.named ? { parameter_name: p } : {}), text: values[p] }));
  return post(config, to, {
    type: "template",
    template: { name: template.name, language: { code: template.language }, ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}) },
  });
}

/** Shows the customer blue ticks. */
export async function postRead(config: WaConfig, waId: string): Promise<void> {
  await graph(config, `/${config.phoneNumberId}/messages`, { method: "POST", body: { messaging_product: "whatsapp", status: "read", message_id: waId } });
}

let templates: { at: number; list: WaTemplate[] } | null = null;
const TEMPLATES_TTL_MS = 5 * 60_000;

/** Approved templates, kept for five minutes. */
export async function approvedTemplates(config: WaConfig): Promise<WaTemplate[]> {
  if (!config.businessAccountId) return [];
  if (templates && Date.now() - templates.at < TEMPLATES_TTL_MS) return templates.list;
  const json = await graph(config, `/${config.businessAccountId}/message_templates?status=APPROVED&limit=100`);
  const list = usableTemplates((json as { data?: unknown } | null)?.data);
  templates = { at: Date.now(), list };
  return list;
}

/** WhatsApp's own ceiling for audio and video; larger documents stay on the phone. */
export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

/** The access token only ever goes to Meta's own file hosts. */
function trustedFileUrl(config: WaConfig, raw: string): URL | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (url.origin === new URL(config.graphUrl).origin) return url;
  const meta = [".fbsbx.com", ".facebook.com", ".fbcdn.net", ".whatsapp.net"].some((d) => url.hostname.endsWith(d));
  return url.protocol === "https:" && meta ? url : null;
}

/** A received file's bytes, or null when it's gone, too big or not where it should be. */
export async function downloadMedia(config: WaConfig, mediaId: string): Promise<Uint8Array | null> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(mediaId)) return null;
  const meta = z.object({ url: z.string() }).safeParse(await graph(config, `/${mediaId}`)).data;
  const url = meta ? trustedFileUrl(config, meta.url) : null;
  if (!url) return null;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  if (!res.ok || !res.body || Number(res.headers.get("content-length") ?? 0) > MEDIA_MAX_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MEDIA_MAX_BYTES) return null;
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
