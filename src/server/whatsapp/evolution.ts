import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { FILE_MAX_BYTES } from "../../domain/evolution";
import { env } from "../env";
import { safeEqual, WaError, type Recipient } from "./client";

// Evolution API: WhatsApp linked as a device, in its own container that only
// the app can reach (docs/WHATSAPP.md).

/** The one linked number. */
export const INSTANCE = "halohaul";

export interface EvoConfig {
  url: string;
  apiKey: string;
  /** Where Evolution reaches the app on their shared network. */
  webhookUrl: string;
}

export function evolutionConfig(): EvoConfig | null {
  const e = env();
  if (!e.EVOLUTION_API_URL || !e.EVOLUTION_API_KEY) return null;
  return { url: e.EVOLUTION_API_URL.replace(/\/$/, ""), apiKey: e.EVOLUTION_API_KEY, webhookUrl: e.EVOLUTION_WEBHOOK_URL };
}

/** Evolution sends this back with every webhook. Derived, so there's one secret to keep. */
export const webhookSecret = (config: EvoConfig) => createHmac("sha256", config.apiKey).update("halohaul-webhook").digest("hex");

export function validWebhook(config: EvoConfig, header: string | null): boolean {
  return header !== null && safeEqual(`Bearer ${webhookSecret(config)}`, header);
}

class EvoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Evolution ${status}`);
  }
}

async function call(config: EvoConfig, path: string, opts: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number } = {}): Promise<unknown> {
  const res = await fetch(`${config.url}${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: config.apiKey, ...(opts.body === undefined ? {} : { "content-type": "application/json" }) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) throw new EvoHttpError(res.status, raw.slice(0, 2000));
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---- linking --------------------------------------------------------------------

/** unreachable: Evolution isn't running. missing: never linked. */
export type LinkState = "open" | "connecting" | "close" | "missing" | "unreachable";

export async function linkState(config: EvoConfig): Promise<LinkState> {
  try {
    const json = await call(config, `/instance/connectionState/${INSTANCE}`, { timeoutMs: 3000 });
    const state = z.object({ instance: z.object({ state: z.string().nullish() }) }).safeParse(json).data?.instance.state;
    return state === "open" || state === "connecting" ? state : "close";
  } catch (e) {
    return e instanceof EvoHttpError && e.status === 404 ? "missing" : "unreachable";
  }
}

const webhook = (config: EvoConfig) => ({
  enabled: true,
  url: config.webhookUrl,
  headers: { authorization: `Bearer ${webhookSecret(config)}` },
  byEvents: false,
  base64: false,
  events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
});

/** Starts linking (or carries on) and returns the QR code to scan, when there is one yet. */
export async function startLink(config: EvoConfig): Promise<{ state: LinkState; qr: string | null }> {
  const state = await linkState(config);
  if (state === "unreachable" || state === "open") return { state, qr: null };
  if (state === "missing") {
    await call(config, "/instance/create", {
      method: "POST",
      body: { instanceName: INSTANCE, integration: "WHATSAPP-BAILEYS", qrcode: false, groupsIgnore: true, rejectCall: false, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false, webhook: webhook(config) },
    });
  } else if (state === "close") {
    await call(config, `/webhook/set/${INSTANCE}`, { method: "POST", body: { webhook: webhook(config) } });
  }
  const json = await call(config, `/instance/connect/${INSTANCE}`);
  const qr = z.object({ base64: z.string().startsWith("data:image/png;base64,") }).safeParse(json).data?.base64 ?? null;
  return { state: await linkState(config), qr };
}

/** Logs the device out and forgets its session. */
export async function unlink(config: EvoConfig): Promise<void> {
  await call(config, `/instance/logout/${INSTANCE}`, { method: "DELETE" }).catch(() => {});
  await call(config, `/instance/delete/${INSTANCE}`, { method: "DELETE" }).catch((e) => {
    if (!(e instanceof EvoHttpError && e.status === 404)) throw e;
  });
}

// ---- messages -------------------------------------------------------------------

export async function evoText(config: EvoConfig, to: Recipient, text: string): Promise<string> {
  let json: unknown;
  try {
    json = await call(config, `/message/sendText/${INSTANCE}`, { method: "POST", body: { number: to.phone?.replace(/\D/g, "") ?? to.userRef, text } });
  } catch (e) {
    if (!(e instanceof EvoHttpError)) throw new WaError("Couldn't reach WhatsApp, so it may not have been sent. Check with them before sending again.");
    if (/"exists"\s*:\s*false/.test(e.detail)) throw new WaError("That number isn't on WhatsApp.");
    if (e.status === 404 || /connection closed/i.test(e.detail)) throw new WaError("WhatsApp is disconnected. Link it again in Settings.");
    console.error("[whatsapp] evolution", e.status, e.detail.slice(0, 300));
    throw new WaError("WhatsApp refused it. Check the link in Settings, then try again.");
  }
  const id = z.object({ key: z.object({ id: z.string().min(1) }) }).safeParse(json).data?.key.id;
  if (!id) throw new WaError("WhatsApp gave an unexpected answer, so it may not have been sent.");
  return id;
}

export async function evoRead(config: EvoConfig, to: Recipient, waId: string): Promise<void> {
  const remoteJid = to.phone ? `${to.phone.replace(/\D/g, "")}@s.whatsapp.net` : to.userRef;
  await call(config, `/chat/markMessageAsRead/${INSTANCE}`, { method: "POST", body: { readMessages: [{ id: waId, fromMe: false, remoteJid }] } });
}

export async function evoFile(config: EvoConfig, mediaId: string): Promise<Uint8Array | null> {
  const json = await call(config, `/chat/getBase64FromMediaMessage/${INSTANCE}`, { method: "POST", body: { message: { key: { id: mediaId } } }, timeoutMs: 60_000 });
  const base64 = z.object({ base64: z.string() }).safeParse(json).data?.base64;
  if (!base64) return null;
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  return bytes.byteLength > 0 && bytes.byteLength <= FILE_MAX_BYTES ? bytes : null;
}
