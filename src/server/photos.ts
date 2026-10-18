import "server-only";
import type { ObjectStore } from "./storage";

// Photo key rules and signed URLs. Deliberately free of sharp so pages that
// only *show* photos never load the native image library.

export const GET_EXPIRES_S = 600;
export const UUID_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isOwnPhotoKey(userId: string, key: string): boolean {
  return new RegExp(`^photos/${escapeRe(userId)}/${UUID_RE}\\.webp$`).test(key);
}

/** Presigned GET for a student's own photo; null for anyone else's key. */
export async function ownPhotoUrl(store: ObjectStore, userId: string, key: string): Promise<string | null> {
  if (!isOwnPhotoKey(userId, key)) return null;
  return store.presignGet(key, GET_EXPIRES_S);
}

/** Admin-uploaded images (help pictures, product photos, QC, the DuitNow QR): admin/{purpose}/{uuid}.webp. */
export function isAdminImageKey(key: string): boolean {
  return new RegExp(`^admin/[a-z_]+/${UUID_RE}\\.webp$`).test(key);
}

/** The 400px thumbnail stored next to every processed image. */
export function thumbKey(key: string): string {
  return key.replace(/\.webp$/, ".thumb.webp");
}

/** Any processed image key (student photo or admin image). Callers decide who may see it. */
export function isImageKey(key: string): boolean {
  return isAdminImageKey(key) || new RegExp(`^photos/[A-Za-z0-9_-]{8,64}/${UUID_RE}\\.webp$`).test(key);
}

/**
 * Admin-side image URLs (full size + thumbnail) for keys the admin may see —
 * any student photo or admin image. Null without storage or for a bad key.
 */
export async function imageUrls(store: ObjectStore | null, key: string): Promise<{ full: string; thumb: string } | null> {
  if (!store || !isImageKey(key)) return null;
  const [full, thumb] = await Promise.all([store.presignGet(key, GET_EXPIRES_S), store.presignGet(thumbKey(key), GET_EXPIRES_S)]);
  return { full, thumb };
}

export async function imageUrlMap(store: ObjectStore | null, keys: readonly string[]): Promise<Record<string, { full: string; thumb: string }>> {
  const entries = await Promise.all(keys.map(async (k) => [k, await imageUrls(store, k)] as const));
  return Object.fromEntries(entries.filter((e): e is readonly [string, { full: string; thumb: string }] => e[1] !== null));
}

/**
 * Presigned URLs for every "how to measure" image a catalogue uses (library
 * defaults and per-field overrides), keyed by image key. Empty without storage.
 */
export async function helpImageUrls(
  store: ObjectStore | null,
  catalog: { categories: Array<{ definition: { sections: Array<{ fields: Array<{ helpImageKey?: string }> }> } }>; measurements: Array<{ helpImageKey: string | null }> },
): Promise<Record<string, string>> {
  if (!store) return {};
  const keys = new Set<string>();
  for (const m of catalog.measurements) if (m.helpImageKey) keys.add(m.helpImageKey);
  for (const c of catalog.categories)
    for (const s of c.definition.sections) for (const f of s.fields) if (f.helpImageKey) keys.add(f.helpImageKey);
  const entries = await Promise.all(
    [...keys].filter(isAdminImageKey).map(async (k) => [k, await store.presignGet(k, GET_EXPIRES_S)] as const),
  );
  return Object.fromEntries(entries);
}
