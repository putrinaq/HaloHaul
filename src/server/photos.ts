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
