"use server";

import { z } from "zod";
import { MAX_TEXT_LENGTH } from "@/domain/whatsapp";
import { ok, runAdmin, UserError } from "@/server/admin/run";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rateLimit";
import { evolutionConfig, startLink, unlink } from "@/server/whatsapp/evolution";
import { whatsappGateway } from "@/server/whatsapp/gateway";
import { markRead, sendTemplate, sendText } from "@/server/whatsapp/inbox";

const target = { id: z.uuid(), chatId: z.uuid().nullable(), customerId: z.string().min(8).max(64).nullable() };

function connected() {
  const gateway = whatsappGateway();
  if (!gateway) throw new UserError("WhatsApp isn't connected yet.");
  return gateway;
}

export async function sendTextAction(raw: unknown) {
  const schema = z.object({ ...target, text: z.string().trim().min(1, "Write a message").max(MAX_TEXT_LENGTH, "That message is too long") });
  return runAdmin(schema, raw, async ({ admin, db }, input) => {
    const gateway = connected();
    // Enough for answering by hand, not for blasting messages out.
    if (gateway.kind === "evolution" && !rateLimit(`wa-send:${admin.id}`, 15, 60_000).ok) throw new UserError("That's a lot of messages in a minute. Wait a little, then go on.");
    return ok(await sendText(db, gateway, admin.id, input));
  });
}

export async function sendTemplateAction(raw: unknown) {
  const schema = z.object({ ...target, name: z.string().max(512), language: z.string().max(20), values: z.record(z.string().max(60), z.string().max(1000)) });
  return runAdmin(schema, raw, async ({ admin, db }, input) => ok(await sendTemplate(db, connected(), admin.id, input)));
}

export async function markReadAction(raw: unknown) {
  return runAdmin(z.object({ chatId: z.uuid() }), raw, async ({ db }, input) => {
    await markRead(db, whatsappGateway(), input.chatId);
    return ok(undefined);
  });
}

// ---- linking a phone (Evolution API) ------------------------------------------------

function evolution() {
  const config = evolutionConfig();
  if (!config) throw new UserError("Evolution API isn't set up on the server.");
  return config;
}

/** Starts or continues linking; the page calls it again until the phone has scanned. */
export async function linkWhatsappAction(raw: unknown) {
  return runAdmin(z.object({ confirmed: z.literal(true, { error: "Tick the box first" }) }), raw, async ({ admin, db }) => {
    const r = await startLink(evolution()).catch((e) => {
      console.error("[whatsapp] link", e);
      throw new UserError("Couldn't start linking. Check the WhatsApp service on the server.");
    });
    if (r.state === "open") await audit(db, { actorId: admin.id, action: "whatsapp.link", entityType: "settings", entityId: "whatsapp", summary: "Linked WhatsApp" });
    return ok(r);
  });
}

export async function unlinkWhatsappAction(raw: unknown) {
  return runAdmin(z.object({}), raw, async ({ admin, db }) => {
    await unlink(evolution()).catch((e) => {
      console.error("[whatsapp] unlink", e);
      throw new UserError("Couldn't unlink it here. On the phone: Settings → Linked devices → log it out.");
    });
    await audit(db, { actorId: admin.id, action: "whatsapp.unlink", entityType: "settings", entityId: "whatsapp", summary: "Unlinked WhatsApp" });
    return ok(undefined);
  });
}
