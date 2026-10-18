"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { libraryFields, sanitizeSavedMeasurements, validateDetails } from "@/domain/categorySchema";
import { normalizeMyMobile } from "@/domain/phone";
import { getCatalog } from "@/server/data/categories";
import { getProfile, setSavedMeasurements, upsertProfile } from "@/server/data/customer";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getSessionUser } from "@/server/session";

export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function currentUserId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return rateLimit(`profile:${user.id}`, LIMITS.profileUpdate.limit, LIMITS.profileUpdate.windowMs).ok ? user.id : null;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(30),
  campus: z.string().trim().max(120),
});

export async function updateProfileAction(raw: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again, or wait a moment and retry." };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const phone = parsed.data.phone ? normalizeMyMobile(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: { phone: "Enter a Malaysian mobile number, e.g. 012-345 6789" } };
  }
  await upsertProfile(getDb(), userId, {
    displayName: parsed.data.displayName,
    phone,
    campus: parsed.data.campus || null,
  });
  revalidatePath("/account");
  return { ok: true };
}

/**
 * Replaces the saved measurements with the submitted form: every active
 * measurement is optional and checked against the library; an empty box
 * removes that value. Values for switched-off measurements are kept.
 */
export async function saveMeasurementsAction(details: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again, or wait a moment and retry." };
  const db = getDb();
  const [profile, catalog] = await Promise.all([getProfile(db, userId), getCatalog(db)]);
  if (!profile) return { ok: false, error: "Add your name first, then save measurements." };

  const r = validateDetails(libraryFields(catalog.measurements), details);
  if (!r.ok) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(Object.entries(r.fieldErrors).map(([k, m]) => [`details.${k}`, m])),
    };
  }
  const active = new Set(catalog.measurements.filter((m) => m.isActive).map((m) => m.key));
  const kept = Object.fromEntries(Object.entries(profile.savedMeasurements).filter(([k]) => !active.has(k)));
  const next = sanitizeSavedMeasurements({ ...kept, ...r.value }, catalog.measurements);
  await setSavedMeasurements(db, userId, next);
  revalidatePath("/account");
  return { ok: true };
}
