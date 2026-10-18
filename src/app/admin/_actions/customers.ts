"use server";

import { z } from "zod";
import { anonymiseCustomer, updateCustomerMeasurements, updateCustomerNotes } from "@/server/admin/customers";
import { createFromOrder, deleteProduct, saveProduct, setPublished } from "@/server/admin/products";
import { ok, runAdmin } from "@/server/admin/run";
import { getPhotoStore } from "@/server/storage";
import { PLATFORMS, SHIPPING_MODES } from "@/domain/enums";

const customerId = z.string().min(8).max(64);

export async function customerNotesAction(raw: unknown) {
  return runAdmin(z.object({ id: customerId, notes: z.string().trim().max(5000).nullable() }), raw, async ({ admin, db }, input) => {
    await updateCustomerNotes(db, admin.id, input.id, input.notes || null);
    return ok(undefined, "Notes saved");
  });
}

export async function customerMeasurementsAction(raw: unknown) {
  return runAdmin(z.object({ id: customerId, details: z.record(z.string(), z.unknown()) }), raw, async ({ admin, db }, input) => {
    await updateCustomerMeasurements(db, admin.id, input.id, input.details);
    return ok(undefined, "Measurements saved");
  });
}

export async function anonymiseCustomerAction(raw: unknown) {
  return runAdmin(z.object({ id: customerId, confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }) }), raw, async ({ admin, db }, input) => {
    await anonymiseCustomer(db, admin.id, input.id, getPhotoStore());
    return ok(undefined, "Customer anonymised");
  });
}

// ---- products (showcase) -----------------------------------------------------------------

const productSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(2, "Add a title").max(120),
  variant: z.string().trim().max(120).nullable(),
  platform: z.enum(PLATFORMS),
  shippingMode: z.enum(SHIPPING_MODES),
  productUrl: z.url().max(2000).nullable(),
  category: z.string().max(40).nullable(),
  retailPriceSen: z.number().int().min(0).max(100_000_000),
  halohaulPriceSen: z.number().int().min(0).max(100_000_000),
  photoKey: z.string().max(300).nullable(),
  retailCheckedAt: z.coerce.date().nullable(),
  isPublished: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
  sourceOrderId: z.number().int().positive().nullable(),
});

export async function saveProductAction(raw: unknown) {
  return runAdmin(productSchema, raw, async ({ admin, db }, { id, ...input }) => {
    const saved = await saveProduct(db, admin.id, id, input);
    return ok({ id: saved }, id ? "Card saved" : "Card created");
  });
}

export async function publishProductAction(raw: unknown) {
  return runAdmin(z.object({ id: z.uuid(), published: z.boolean() }), raw, async ({ admin, db }, input) => {
    await setPublished(db, admin.id, input.id, input.published);
    return ok(undefined, input.published ? "Published" : "Hidden");
  });
}

export async function deleteProductAction(raw: unknown) {
  return runAdmin(z.object({ id: z.uuid() }), raw, async ({ admin, db }, input) => {
    await deleteProduct(db, admin.id, input.id);
    return ok(undefined, "Card deleted");
  });
}

export async function productFromOrderAction(raw: unknown) {
  return runAdmin(z.object({ orderId: z.number().int().positive() }), raw, async ({ db }, input) => ok(await createFromOrder(db, input.orderId)));
}
