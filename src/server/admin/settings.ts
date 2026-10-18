import "server-only";
import { asc, count, desc, eq } from "drizzle-orm";
import { auditLog, fxRates, restrictedItems, settings, users } from "../../db/schema";
import type { Db } from "../../db/types";
import type { ShippingMode } from "../../domain/enums";
import { settingsSchema, type Settings } from "../../domain/settings";
import { audit } from "../audit";
import { getSettings } from "../data/catalog";
import { UserError } from "../errors";

// Settings pages. The settings row is one validated JSON document; each page
// replaces one section of it. Every change is audit-logged (who, when, before
// and after), and exchange rates also keep their own history.

export type SettingsSection = "fees" | "fx" | "shipping" | "pickup" | "quote" | "store" | "messages";

const SECTION_LABELS: Record<SettingsSection, string> = {
  fees: "Fees",
  fx: "Exchange rate",
  shipping: "Shipping rates",
  pickup: "Pickup",
  quote: "Quotes",
  store: "Store",
  messages: "Message templates",
};

export async function updateSettingsSection<K extends SettingsSection>(db: Db, actorId: string, section: K, value: unknown, note?: string | null) {
  return db.transaction(async (tx) => {
    const current = await getSettings(tx);
    const [row] = await tx.select({ data: settings.data }).from(settings).where(eq(settings.id, 1)).for("update");
    const nextData = { ...(row?.data ?? {}), [section]: value };
    const parsed = settingsSchema.safeParse(nextData);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UserError(first.message, { [first.path.slice(1).join(".") || section]: first.message });
    }
    await tx
      .insert(settings)
      .values({ id: 1, data: parsed.data, updatedBy: actorId })
      .onConflictDoUpdate({ target: settings.id, set: { data: parsed.data, updatedBy: actorId } });
    if (section === "fx" && parsed.data.fx.defaultMyrPerCny !== current.fx.defaultMyrPerCny) {
      await tx.insert(fxRates).values({ myrPerCny: parsed.data.fx.defaultMyrPerCny, note: note || null, setBy: actorId });
    }
    await audit(tx, {
      actorId,
      action: `settings.${section}`,
      entityType: "settings",
      entityId: section,
      summary: `Changed ${SECTION_LABELS[section].toLowerCase()}`,
      data: { before: current[section as keyof Settings] as unknown, after: parsed.data[section as keyof Settings] as unknown },
    });
    return parsed.data;
  });
}

export async function fxHistory(db: Db, limit = 25) {
  return db
    .select({ id: fxRates.id, myrPerCny: fxRates.myrPerCny, note: fxRates.note, createdAt: fxRates.createdAt, by: users.name })
    .from(fxRates)
    .leftJoin(users, eq(users.id, fxRates.setBy))
    .orderBy(desc(fxRates.createdAt))
    .limit(limit);
}

// ---- restricted items -------------------------------------------------------------------------

export async function listRestricted(db: Db) {
  return db.select().from(restrictedItems).orderBy(asc(restrictedItems.keyword));
}

export interface RestrictedInput {
  keyword: string;
  appliesToModes: ShippingMode[];
  forwarder: string | null;
  note: string | null;
}

export async function saveRestricted(db: Db, actorId: string, id: string | null, input: RestrictedInput) {
  return db.transaction(async (tx) => {
    if (id) await tx.update(restrictedItems).set(input).where(eq(restrictedItems.id, id));
    else await tx.insert(restrictedItems).values(input);
    await audit(tx, { actorId, action: "settings.restricted", entityType: "restricted_item", entityId: id, summary: `${id ? "Edited" : "Added"} restricted keyword “${input.keyword}”`, data: { ...input } });
  });
}

export async function deleteRestricted(db: Db, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(restrictedItems).where(eq(restrictedItems.id, id));
    if (!row) return;
    await tx.delete(restrictedItems).where(eq(restrictedItems.id, id));
    await audit(tx, { actorId, action: "settings.restricted", entityType: "restricted_item", entityId: id, summary: `Removed restricted keyword “${row.keyword}”` });
  });
}

// ---- audit log ---------------------------------------------------------------------------------

export async function auditPage(db: Db, page: number, pageSize = 25) {
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: auditLog.id, action: auditLog.action, summary: auditLog.summary, entityType: auditLog.entityType, entityId: auditLog.entityId, createdAt: auditLog.createdAt, by: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(auditLog),
  ]);
  return { rows, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}
