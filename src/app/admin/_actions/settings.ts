"use server";

import { z } from "zod";
import { FIELD_KEY_RE } from "@/domain/categoryDefinition";
import { isCategoryIcon } from "@/domain/categoryIcons";
import { CATEGORY_FULFILMENTS, MEASUREMENT_GROUPS, MEASUREMENT_UNITS, SHIPPING_MODES } from "@/domain/enums";
import { ok, runAdmin } from "@/server/admin/run";
import {
  createCategory,
  createMeasurement,
  deleteCategory,
  deleteMeasurement,
  discardDraft,
  draftDiff,
  publishDraft,
  reorderCategories,
  saveDraft,
  updateCategoryInfo,
  updateMeasurement,
} from "@/server/admin/categories";
import { deleteRestricted, saveRestricted, updateSettingsSection } from "@/server/admin/settings";

// Server actions for the Settings pages. Each settings section is validated by
// the full settings schema inside updateSettingsSection; categories by the
// definition meta-schema inside saveDraft/publishDraft.

const SECTIONS = ["fees", "fx", "shipping", "pickup", "quote", "store", "messages"] as const;

export async function saveSettingsAction(raw: unknown) {
  return runAdmin(z.object({ section: z.enum(SECTIONS), value: z.unknown(), note: z.string().trim().max(200).nullable().optional() }), raw, async ({ admin, db }, input) => {
    await updateSettingsSection(db, admin.id, input.section, input.value, input.note);
    return ok(undefined, "Saved");
  });
}

const restrictedSchema = z.object({
  id: z.uuid().nullable(),
  keyword: z.string().trim().min(2, "At least 2 characters").max(80),
  appliesToModes: z.array(z.enum(SHIPPING_MODES)).max(5),
  forwarder: z.string().trim().max(80).nullable(),
  note: z.string().trim().max(300).nullable(),
});

export async function saveRestrictedAction(raw: unknown) {
  return runAdmin(restrictedSchema, raw, async ({ admin, db }, { id, ...input }) => {
    await saveRestricted(db, admin.id, id, { ...input, forwarder: input.forwarder || null, note: input.note || null });
    return ok(undefined, "Saved");
  });
}

export async function deleteRestrictedAction(raw: unknown) {
  return runAdmin(z.object({ id: z.uuid() }), raw, async ({ admin, db }, { id }) => {
    await deleteRestricted(db, admin.id, id);
    return ok(undefined, "Removed");
  });
}

// ---- categories -------------------------------------------------------------------------------

const mm = z.number().int().min(0).max(5_000_000);
const infoSchema = z.object({
  name: z.string().trim().min(2, "Add a name").max(60),
  icon: z.string().refine(isCategoryIcon, "Pick an icon"),
  fulfilment: z.enum(CATEGORY_FULFILMENTS),
  defaultWeightG: mm,
  defaultLengthMm: mm,
  defaultWidthMm: mm,
  defaultHeightMm: mm,
  allowedShippingModes: z.array(z.enum(SHIPPING_MODES)).max(5),
  restrictedNote: z.string().trim().max(300).nullable(),
  isActive: z.boolean(),
});

export async function createCategoryAction(raw: unknown) {
  return runAdmin(infoSchema.extend({ key: z.string().regex(FIELD_KEY_RE, "Lowercase letters, numbers and _") }), raw, async ({ admin, db }, input) => {
    const id = await createCategory(db, admin.id, { ...input, restrictedNote: input.restrictedNote || null });
    return ok({ id }, "Category created as a draft");
  });
}

export async function updateCategoryAction(raw: unknown) {
  return runAdmin(infoSchema.extend({ id: z.uuid() }), raw, async ({ admin, db }, { id, ...input }) => {
    await updateCategoryInfo(db, admin.id, id, { ...input, restrictedNote: input.restrictedNote || null });
    return ok(undefined, "Saved");
  });
}

export async function reorderCategoriesAction(raw: unknown) {
  return runAdmin(z.object({ ids: z.array(z.uuid()).max(200) }), raw, async ({ admin, db }, { ids }) => {
    await reorderCategories(db, admin.id, ids);
    return ok(undefined);
  });
}

export async function deleteCategoryAction(raw: unknown) {
  return runAdmin(z.object({ id: z.uuid() }), raw, async ({ admin, db }, { id }) => {
    await deleteCategory(db, admin.id, id);
    return ok(undefined, "Deleted");
  });
}

export async function saveDraftAction(raw: unknown) {
  return runAdmin(z.object({ categoryId: z.uuid(), definition: z.unknown() }), raw, async ({ admin, db }, input) => {
    await saveDraft(db, admin.id, input.categoryId, input.definition);
    return ok(undefined, "Draft saved");
  });
}

export async function discardDraftAction(raw: unknown) {
  return runAdmin(z.object({ categoryId: z.uuid() }), raw, async ({ admin, db }, input) => {
    await discardDraft(db, admin.id, input.categoryId);
    return ok(undefined, "Draft discarded");
  });
}

export async function draftDiffAction(raw: unknown) {
  return runAdmin(z.object({ categoryId: z.uuid() }), raw, async ({ db }, input) => {
    const d = await draftDiff(db, input.categoryId);
    if (!d) return { ok: false, error: "There's no draft to publish." };
    return ok(d);
  });
}

export async function publishDraftAction(raw: unknown) {
  return runAdmin(z.object({ categoryId: z.uuid() }), raw, async ({ admin, db }, input) => {
    const { version } = await publishDraft(db, admin.id, input.categoryId);
    return ok(undefined, `Version ${version} is live`);
  });
}

// ---- measurement library ------------------------------------------------------------------------

const measurementSchema = z.object({
  label: z.string().trim().min(2, "Add a label").max(60),
  unit: z.enum(MEASUREMENT_UNITS),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().finite().positive("Above 0"),
  helpText: z.string().trim().max(300).nullable(),
  helpImageKey: z.string().regex(/^admin\/help\/[0-9a-f-]{36}\.webp$/).nullable(),
  group: z.enum(MEASUREMENT_GROUPS),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
});

export async function saveMeasurementAction(raw: unknown) {
  return runAdmin(measurementSchema.extend({ key: z.string().regex(FIELD_KEY_RE, "Lowercase letters, numbers and _"), isNew: z.boolean() }), raw, async ({ admin, db }, { key, isNew, ...input }) => {
    const value = { ...input, helpText: input.helpText || null };
    if (isNew) await createMeasurement(db, admin.id, { key, ...value });
    else await updateMeasurement(db, admin.id, key, value);
    return ok(undefined, "Saved");
  });
}

export async function deleteMeasurementAction(raw: unknown) {
  return runAdmin(z.object({ key: z.string().regex(FIELD_KEY_RE) }), raw, async ({ admin, db }, { key }) => {
    await deleteMeasurement(db, admin.id, key);
    return ok(undefined, "Deleted");
  });
}
