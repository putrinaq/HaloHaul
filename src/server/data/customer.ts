import "server-only";
import { eq } from "drizzle-orm";
import { customerProfiles } from "../../db/schema";
import type { Db } from "../../db/types";
import { sanitizeSavedMeasurements, type SavedMeasurements } from "../../domain/categories";

// Personal data (phone, measurements, prescriptions). Always keyed by the
// session user's id — never by an id taken from the request.

export interface Profile {
  displayName: string;
  phone: string | null;
  campus: string | null;
  savedMeasurements: SavedMeasurements;
}

export async function getProfile(db: Db, userId: string): Promise<Profile | null> {
  const [row] = await db
    .select({
      displayName: customerProfiles.displayName,
      phone: customerProfiles.phone,
      campus: customerProfiles.campus,
      savedMeasurements: customerProfiles.savedMeasurements,
    })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, userId));
  if (!row) return null;
  return { ...row, savedMeasurements: sanitizeSavedMeasurements(row.savedMeasurements) };
}

export async function upsertProfile(
  db: Db,
  userId: string,
  values: { displayName: string; phone: string | null; campus: string | null; savedMeasurements?: SavedMeasurements },
): Promise<void> {
  const set = {
    displayName: values.displayName,
    phone: values.phone,
    campus: values.campus,
    ...(values.savedMeasurements ? { savedMeasurements: values.savedMeasurements } : {}),
  };
  await db
    .insert(customerProfiles)
    .values({ userId, ...set, savedMeasurements: values.savedMeasurements ?? {} })
    .onConflictDoUpdate({ target: customerProfiles.userId, set });
}

export async function setSavedMeasurements(db: Db, userId: string, saved: SavedMeasurements): Promise<boolean> {
  const updated = await db
    .update(customerProfiles)
    .set({ savedMeasurements: saved })
    .where(eq(customerProfiles.userId, userId))
    .returning({ userId: customerProfiles.userId });
  return updated.length > 0;
}
