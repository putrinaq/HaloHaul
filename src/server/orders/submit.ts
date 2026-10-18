import "server-only";
import { customerProfiles, ledgerEntries, orders, orderStatusHistory } from "../../db/schema";
import type { Db } from "../../db/types";
import { findCategory, isShippable } from "../../domain/catalog";
import { hasMeasurements, mergeMeasurements } from "../../domain/categorySchema";
import { upfrontFee } from "../../domain/fees";
import { parseFxRate } from "../../domain/money";
import { validateOrderInput } from "../../domain/orderInput";
import { detailStrings, matchRestricted, restrictedReason } from "../../domain/restricted";
import { scaleParcel } from "../../domain/shipping";
import { buildShippingSnapshot, shippingOptions } from "../../domain/shippingOptions";
import { getNextCutoffs, getRestrictedRules, getSettings } from "../data/catalog";
import { getCatalog } from "../data/categories";
import { getProfile } from "../data/customer";
import { isOwnPhotoKey } from "../photos";

export type SubmitOrderResult =
  | { ok: true; orderId: number; restricted: boolean; rerouted: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

/**
 * Validates and stores a new order for `userId` (the session user — never an
 * id from the request). Restricted matches don't block submission; they hold
 * the order for admin review before any quote goes out. Reverse-search and
 * consultation orders get their upfront fee posted to the ledger.
 */
export async function submitOrder(db: Db, userId: string, raw: unknown, now = new Date()): Promise<SubmitOrderResult> {
  const catalog = await getCatalog(db);
  const result = validateOrderInput(raw, catalog);
  if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };
  const input = result.value;

  if (!input.referencePhotoKeys.every((k) => isOwnPhotoKey(userId, k))) {
    return { ok: false, fieldErrors: { referencePhotoKeys: "One of the photos couldn't be found. Upload it again." } };
  }

  const category = findCategory(catalog, input.category);
  if (!category || category.versionId !== input.categoryVersionId) {
    return { ok: false, fieldErrors: { category: "This category was just updated. Check the form and try again." } };
  }

  const [settings, rules, cutoffs, profile] = await Promise.all([
    getSettings(db),
    getRestrictedRules(db),
    getNextCutoffs(db, now),
    getProfile(db, userId),
  ]);
  const fxRate = parseFxRate(settings.fx.defaultMyrPerCny);

  const options = shippingOptions({
    platform: input.platform,
    pathType: input.pathType,
    category,
    quantity: input.quantity,
    settings,
    fxRate,
    nextCutoffs: cutoffs,
    now,
  });
  const snapshot = buildShippingSnapshot(input.shippingMode, category.key, options, now);

  const matches = matchRestricted(
    {
      texts: [input.itemName, input.productUrl, input.variantText, input.remarks, ...detailStrings(input.details)],
      shippingMode: input.shippingMode,
      forwarder: settings.shipping.defaultForwarder,
    },
    rules,
  );

  const parcel = isShippable(category) ? scaleParcel(category.defaultParcel, input.quantity) : null;

  const saved = profile?.savedMeasurements ?? {};
  const savedMeasurements =
    input.saveMeasurements && hasMeasurements(category.definition) ? mergeMeasurements(saved, category.definition, input.details) : saved;
  const fee = upfrontFee(input.pathType, settings);

  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        customerId: userId,
        itemName: input.itemName,
        pathType: input.pathType,
        platform: input.platform,
        productUrl: input.productUrl,
        referencePhotoKeys: input.referencePhotoKeys,
        categoryVersionId: category.versionId,
        details: input.details,
        variantText: input.variantText,
        quantity: input.quantity,
        conditionPreference: input.conditionPreference,
        shippingMode: input.shippingMode,
        fulfilment: input.fulfilment,
        domesticFreeShipping: input.domesticFreeShipping,
        shippingChoiceSnapshot: snapshot,
        estWeightG: parcel?.weightG ?? null,
        estLengthMm: parcel?.lengthMm ?? null,
        estWidthMm: parcel?.widthMm ?? null,
        estHeightMm: parcel?.heightMm ?? null,
        restrictedFlag: matches.length > 0,
        restrictedReason: restrictedReason(matches),
        remarks: input.remarks,
      })
      .returning({ id: orders.id });

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "submitted",
      actorId: userId,
      note: input.rerouted ? "Link was a content post — routed to photo search." : null,
    });

    if (fee && fee.amountSen > 0) {
      await tx.insert(ledgerEntries).values({
        orderId: order.id,
        customerId: userId,
        type: fee.type,
        amountSen: fee.amountSen,
        reference: "upfront fee",
        createdBy: userId,
      });
    }

    const profileValues = {
      displayName: input.contact.displayName,
      phone: input.contact.phone,
      campus: input.contact.campus,
      savedMeasurements,
    };
    await tx
      .insert(customerProfiles)
      .values({ userId, ...profileValues })
      .onConflictDoUpdate({ target: customerProfiles.userId, set: profileValues });

    return order.id;
  });

  return { ok: true, orderId, restricted: matches.length > 0, rerouted: input.rerouted };
}
