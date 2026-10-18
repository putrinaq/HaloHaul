import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { categories, categoryVersions, orders, quotes, showcaseProducts } from "../../db/schema";
import type { Db } from "../../db/types";
import type { Platform, ShippingMode } from "../../domain/enums";
import { audit } from "../audit";
import { UserError } from "../errors";
import { isAdminImageKey } from "../photos";

// Products: the "What people bought recently" cards on the home page and
// catalogue. Retail prices go stale; the list warns after 60 days.

export const STALE_RETAIL_DAYS = 60;

export async function listProducts(db: Db, page: number, pageSize = 25) {
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(showcaseProducts).orderBy(asc(showcaseProducts.sortOrder), desc(showcaseProducts.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: count() }).from(showcaseProducts),
  ]);
  return { rows, pageCount: Math.max(1, Math.ceil(n / pageSize)) };
}

export interface ProductInput {
  title: string;
  variant: string | null;
  platform: Platform;
  shippingMode: ShippingMode;
  productUrl: string | null;
  category: string | null;
  retailPriceSen: number;
  halohaulPriceSen: number;
  photoKey: string | null;
  retailCheckedAt: Date | null;
  isPublished: boolean;
  sortOrder: number;
  sourceOrderId: number | null;
}

export async function saveProduct(db: Db, actorId: string, id: string | null, input: ProductInput) {
  if (input.photoKey && !isAdminImageKey(input.photoKey)) throw new UserError("Upload the photo again.");
  if (input.isPublished && !input.photoKey) throw new UserError("Add a photo before publishing.", { photoKey: "Needed to publish" });
  return db.transaction(async (tx) => {
    let productId = id;
    if (id) await tx.update(showcaseProducts).set(input).where(eq(showcaseProducts.id, id));
    else [{ id: productId }] = await tx.insert(showcaseProducts).values(input).returning({ id: showcaseProducts.id });
    await audit(tx, { actorId, action: id ? "product.update" : "product.create", entityType: "product", entityId: productId, summary: `${id ? "Edited" : "Created"} showcase card “${input.title}”` });
    return productId!;
  });
}

export async function setPublished(db: Db, actorId: string, id: string, published: boolean) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(showcaseProducts).where(eq(showcaseProducts.id, id));
    if (!p) throw new UserError("That card no longer exists.");
    if (published && !p.photoKey) throw new UserError("Add a photo before publishing.");
    await tx.update(showcaseProducts).set({ isPublished: published }).where(eq(showcaseProducts.id, id));
    await audit(tx, { actorId, action: "product.publish", entityType: "product", entityId: id, summary: `${published ? "Published" : "Hid"} “${p.title}”` });
  });
}

export async function deleteProduct(db: Db, actorId: string, id: string) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(showcaseProducts).where(eq(showcaseProducts.id, id));
    if (!p) return;
    await tx.delete(showcaseProducts).where(eq(showcaseProducts.id, id));
    await audit(tx, { actorId, action: "product.delete", entityType: "product", entityId: id, summary: `Deleted showcase card “${p.title}”` });
  });
}

/** A card prefilled from a completed order (the admin adds the retail price and a photo). */
export async function createFromOrder(db: Db, orderId: number): Promise<Omit<ProductInput, "photoKey" | "retailCheckedAt" | "isPublished" | "sortOrder"> & { retailPriceSen: number }> {
  const [row] = await db
    .select({ order: orders, categoryKey: categories.key, total: quotes.totalMaxSen })
    .from(orders)
    .innerJoin(categoryVersions, eq(categoryVersions.id, orders.categoryVersionId))
    .innerJoin(categories, eq(categories.id, categoryVersions.categoryId))
    .leftJoin(quotes, and(eq(quotes.orderId, orders.id), eq(quotes.status, "accepted")))
    .where(eq(orders.id, orderId));
  if (!row) throw new UserError("That order wasn't found.");
  if (row.order.status !== "completed") throw new UserError("Only completed orders can become showcase cards.");
  return {
    title: row.order.itemName,
    variant: row.order.variantText,
    platform: row.order.platform,
    shippingMode: row.order.shippingMode,
    productUrl: row.order.productUrl,
    category: row.categoryKey,
    retailPriceSen: 0,
    halohaulPriceSen: row.total ?? 0,
    sourceOrderId: row.order.id,
  };
}

export async function recentCompletedOrders(db: Db) {
  return db
    .select({ id: orders.id, itemName: orders.itemName })
    .from(orders)
    .where(eq(orders.status, "completed"))
    .orderBy(desc(orders.updatedAt))
    .limit(30);
}
