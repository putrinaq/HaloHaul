import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { batches, restrictedItems, settings, showcaseProducts } from "../../db/schema";
import type { Db } from "../../db/types";
import { BATCH_SHIPPING_MODES, type BatchShippingMode } from "../../domain/enums";
import type { RestrictedRule } from "../../domain/restricted";
import { parseSettings, type Settings } from "../../domain/settings";

// Public, non-personal data: settings, batch schedule, showcase, restricted list.

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select({ data: settings.data }).from(settings).where(eq(settings.id, 1));
  return parseSettings(row?.data ?? {});
}

/** Open batches with a future cutoff, soonest first. */
export async function getUpcomingBatches(db: Db, now: Date) {
  return db
    .select({
      id: batches.id,
      code: batches.code,
      mode: batches.mode,
      cutoffAt: batches.cutoffAt,
      minOrders: batches.minOrders,
      pickupStartsAt: batches.pickupStartsAt,
      pickupEndsAt: batches.pickupEndsAt,
    })
    .from(batches)
    .where(and(eq(batches.status, "open"), gt(batches.cutoffAt, now)))
    .orderBy(asc(batches.cutoffAt));
}

export type UpcomingBatch = Awaited<ReturnType<typeof getUpcomingBatches>>[number];

/** The next open batch per mode — what the home countdowns and ETAs use. */
export async function getNextBatchPerMode(db: Db, now: Date): Promise<Partial<Record<BatchShippingMode, UpcomingBatch>>> {
  const upcoming = await getUpcomingBatches(db, now);
  const next: Partial<Record<BatchShippingMode, UpcomingBatch>> = {};
  for (const b of upcoming) next[b.mode] ??= b;
  return next;
}

export async function getNextCutoffs(db: Db, now: Date): Promise<Partial<Record<BatchShippingMode, Date>>> {
  const next = await getNextBatchPerMode(db, now);
  const out: Partial<Record<BatchShippingMode, Date>> = {};
  for (const mode of BATCH_SHIPPING_MODES) if (next[mode]) out[mode] = next[mode]!.cutoffAt;
  return out;
}

const showcaseColumns = {
  id: showcaseProducts.id,
  title: showcaseProducts.title,
  variant: showcaseProducts.variant,
  platform: showcaseProducts.platform,
  shippingMode: showcaseProducts.shippingMode,
  productUrl: showcaseProducts.productUrl,
  category: showcaseProducts.category,
  retailPriceSen: showcaseProducts.retailPriceSen,
  halohaulPriceSen: showcaseProducts.halohaulPriceSen,
  photoKey: showcaseProducts.photoKey,
};

export async function getPublishedShowcase(db: Db, limit = 12) {
  return db
    .select(showcaseColumns)
    .from(showcaseProducts)
    .where(eq(showcaseProducts.isPublished, true))
    .orderBy(asc(showcaseProducts.sortOrder), asc(showcaseProducts.createdAt))
    .limit(limit);
}

export type ShowcaseCard = Awaited<ReturnType<typeof getPublishedShowcase>>[number];

export async function getPublishedShowcaseById(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select(showcaseColumns)
    .from(showcaseProducts)
    .where(and(eq(showcaseProducts.id, id), eq(showcaseProducts.isPublished, true)));
  return row ?? null;
}

export async function getRestrictedRules(db: Db): Promise<RestrictedRule[]> {
  return db
    .select({
      keyword: restrictedItems.keyword,
      appliesToModes: restrictedItems.appliesToModes,
      forwarder: restrictedItems.forwarder,
      note: restrictedItems.note,
    })
    .from(restrictedItems);
}

/** Keywords for the public Terms page. */
export async function getRestrictedKeywords(db: Db) {
  return db
    .select({ keyword: restrictedItems.keyword, note: restrictedItems.note, modes: restrictedItems.appliesToModes })
    .from(restrictedItems)
    .orderBy(asc(restrictedItems.keyword));
}
