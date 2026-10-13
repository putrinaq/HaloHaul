"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getCategory, mergeSavedMeasurements, sanitizeSavedMeasurements } from "@/domain/categories";
import { normalizeMyMobile } from "@/domain/phone";
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

export async function saveMeasurementsAction(category: string, details: unknown): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again, or wait a moment and retry." };
  let def;
  try {
    def = getCategory(category);
  } catch {
    return { ok: false, error: "Unknown category." };
  }
  if (!def.savesToProfile) return { ok: false, error: "That category doesn't save measurements." };
  const parsed = def.schema.safeParse(details);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [`details.${String(i.path[0])}`, i.message])),
    };
  }

  const db = getDb();
  const profile = await getProfile(db, userId);
  if (!profile) return { ok: false, error: "Add your name first, then save measurements." };
  await setSavedMeasurements(db, userId, mergeSavedMeasurements(profile.savedMeasurements, category, parsed.data));
  revalidatePath("/account");
  return { ok: true };
}

export async function removeMeasurementsAction(category: string): Promise<ActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Sign in again, or wait a moment and retry." };
  const db = getDb();
  const profile = await getProfile(db, userId);
  if (!profile) return { ok: true };
  const rest = sanitizeSavedMeasurements(profile.savedMeasurements);
  delete rest[category];
  await setSavedMeasurements(db, userId, rest);
  revalidatePath("/account");
  return { ok: true };
}
