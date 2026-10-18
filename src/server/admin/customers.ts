import "server-only";
import { and, count, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { accounts, customerProfiles, ledgerEntries, orders, sessions, twoFactors, users } from "../../db/schema";
import type { Db } from "../../db/types";
import { libraryFields, sanitizeSavedMeasurements, validateDetails } from "../../domain/categorySchema";
import { balanceOf } from "../../domain/ledger";
import { audit } from "../audit";
import { getCatalog } from "../data/categories";
import { UserError } from "../errors";
import { isOwnPhotoKey, thumbKey } from "../photos";
import type { ObjectStore } from "../storage";

// Customer pages. Personal data lives here, so every write is audit-logged.

const name = sql<string>`coalesce(${customerProfiles.displayName}, ${users.name})`;
const TERMINAL = ["completed", "rejected", "cancelled"] as const;

export async function listCustomers(db: Db, q: string, page: number, pageSize = 25) {
  const term = q.trim();
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const where = and(
    eq(users.role, "student"),
    term ? or(ilike(users.name, like), ilike(users.email, like), ilike(customerProfiles.displayName, like), ilike(customerProfiles.phone, like)) : undefined,
  );
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name,
        email: users.email,
        phone: customerProfiles.phone,
        campus: customerProfiles.campus,
        anonymisedAt: customerProfiles.anonymisedAt,
        orderCount: sql<number>`(select count(*)::int from ${orders} o where o.customer_id = "users"."id")`,
        balanceSen: sql<number>`coalesce((select sum(l.amount_sen)::int from ${ledgerEntries} l where l.customer_id = "users"."id"), 0)`,
        lastOrderAt: sql<Date | null>`(select max(o.created_at) from ${orders} o where o.customer_id = "users"."id")`.mapWith(users.createdAt),
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(where)
      .orderBy(sql`(select max(o.created_at) from ${orders} o where o.customer_id = "users"."id") desc nulls last`, desc(users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(users).leftJoin(customerProfiles, eq(customerProfiles.userId, users.id)).where(where),
  ]);
  return { rows, total: n, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

export async function getCustomer(db: Db, id: string) {
  const [row] = await db
    .select({ user: users, profile: customerProfiles })
    .from(users)
    .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
    .where(and(eq(users.id, id), eq(users.role, "student")));
  if (!row) return null;
  const [orderRows, ledger, catalog] = await Promise.all([
    db
      .select({ id: orders.id, itemName: orders.itemName, status: orders.status, createdAt: orders.createdAt, pathType: orders.pathType })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.createdAt))
      .limit(50),
    db
      .select({ id: ledgerEntries.id, orderId: ledgerEntries.orderId, type: ledgerEntries.type, amountSen: ledgerEntries.amountSen, reference: ledgerEntries.reference, createdAt: ledgerEntries.createdAt })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.customerId, id))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(50),
    getCatalog(db),
  ]);
  const [{ all }] = await db.select({ all: sql<number>`coalesce(sum(${ledgerEntries.amountSen}), 0)::int` }).from(ledgerEntries).where(eq(ledgerEntries.customerId, id));
  return {
    user: { id: row.user.id, name: row.profile?.displayName ?? row.user.name, email: row.user.email, createdAt: row.user.createdAt },
    profile: row.profile
      ? { phone: row.profile.phone, campus: row.profile.campus, internalNotes: row.profile.internalNotes, anonymisedAt: row.profile.anonymisedAt, savedMeasurements: sanitizeSavedMeasurements(row.profile.savedMeasurements, catalog.measurements) }
      : null,
    orders: orderRows,
    ledger,
    balance: balanceOf([{ amountSen: all }]),
    library: catalog.measurements,
  };
}

export async function updateCustomerNotes(db: Db, actorId: string, id: string, notes: string | null) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: customerProfiles.userId }).from(customerProfiles).where(eq(customerProfiles.userId, id));
    if (!p) throw new UserError("This customer has no profile yet (they haven't placed an order).");
    await tx.update(customerProfiles).set({ internalNotes: notes }).where(eq(customerProfiles.userId, id));
    await audit(tx, { actorId, action: "customer.notes", entityType: "customer", entityId: id, summary: "Edited customer notes" });
  });
}

/** Admin correction of saved measurements (same validation as the account page). */
export async function updateCustomerMeasurements(db: Db, actorId: string, id: string, values: unknown) {
  const catalog = await getCatalog(db);
  const r = validateDetails(libraryFields(catalog.measurements), values);
  if (!r.ok) throw new UserError("Check the highlighted fields.", Object.fromEntries(Object.entries(r.fieldErrors).map(([k, m]) => [`details.${k}`, m])));
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ saved: customerProfiles.savedMeasurements }).from(customerProfiles).where(eq(customerProfiles.userId, id));
    if (!p) throw new UserError("This customer has no profile yet.");
    const active = new Set(catalog.measurements.filter((m) => m.isActive).map((m) => m.key));
    const kept = Object.fromEntries(Object.entries(p.saved).filter(([k]) => !active.has(k)));
    const next = sanitizeSavedMeasurements({ ...kept, ...r.value }, catalog.measurements);
    await tx.update(customerProfiles).set({ savedMeasurements: next }).where(eq(customerProfiles.userId, id));
    await audit(tx, { actorId, action: "customer.measurements", entityType: "customer", entityId: id, summary: "Edited saved measurements", data: { before: p.saved, after: next } });
  });
}

/**
 * The PDPA delete: removes everything that identifies the student (name,
 * email, phone, campus, measurements, order details, remarks, photos) and
 * their ability to sign in, but keeps orders and the ledger for the books.
 */
export async function anonymiseCustomer(db: Db, actorId: string, id: string, store: ObjectStore | null) {
  const photos = await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.role, "student"))).for("update");
    if (!u) throw new UserError("That customer no longer exists.");
    const [{ open }] = await tx
      .select({ open: count() })
      .from(orders)
      .where(and(eq(orders.customerId, id), notInArray(orders.status, [...TERMINAL])));
    if (open > 0) throw new UserError(`They still have ${open} order${open === 1 ? "" : "s"} in progress. Finish or cancel them first.`);

    const theirOrders = await tx.select({ id: orders.id, keys: orders.referencePhotoKeys }).from(orders).where(eq(orders.customerId, id));
    const keys = theirOrders.flatMap((o) => o.keys).filter((k) => isOwnPhotoKey(id, k));
    if (theirOrders.length) {
      await tx
        .update(orders)
        .set({ details: {}, remarks: null, variantText: null, referencePhotoKeys: [] })
        .where(inArray(orders.id, theirOrders.map((o) => o.id)));
    }
    await tx
      .update(users)
      .set({ name: "Deleted customer", email: `deleted-${id}@anonymised.invalid`, emailVerified: false, image: null })
      .where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await tx.delete(accounts).where(eq(accounts.userId, id));
    await tx.delete(twoFactors).where(eq(twoFactors.userId, id));
    await tx
      .insert(customerProfiles)
      .values({ userId: id, displayName: "Deleted customer", anonymisedAt: new Date() })
      .onConflictDoUpdate({
        target: customerProfiles.userId,
        set: { displayName: "Deleted customer", phone: null, campus: null, savedMeasurements: {}, internalNotes: null, anonymisedAt: new Date() },
      });
    await audit(tx, { actorId, action: "customer.anonymise", entityType: "customer", entityId: id, summary: `Anonymised a customer (${theirOrders.length} orders kept for accounting)` });
    return keys;
  });
  // After the commit: remove their photos from storage (best effort).
  if (store) for (const k of photos) await Promise.all([store.delete(k), store.delete(thumbKey(k))]).catch(() => {});
}
