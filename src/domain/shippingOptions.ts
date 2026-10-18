import type { ShippingChoiceSnapshot } from "./analytics";
import type { CategoryInfo } from "./catalog";
import type { BatchShippingMode, PathType, Platform, ShippingMode } from "./enums";
import { isBatchShippingMode } from "./enums";
import { SHIPPING_MODE_LABELS } from "./labels";
import type { FxRateMicro, Sen } from "./money";
import type { Settings } from "./settings";
import { estimateShipping } from "./shipping";

// The shipping-mode choice shown on the order form: a price range and an ETA
// per mode, so the student can trade speed against price. What was shown is
// saved with the order for the "speed vs price" report.

const DAY_MS = 86_400_000;

export interface ShippingOption {
  mode: ShippingMode;
  label: string;
  /** Estimated shipping range for this order (category default parcel × qty). */
  minSen: Sen;
  maxSen: Sen;
  /** Days to campus; null when no batch is scheduled yet (or digital). */
  etaDaysMin: number | null;
  etaDaysMax: number | null;
  /** Next batch cutoff for this mode, ISO string. */
  cutoffAt: string | null;
  note: string | null;
}

type ShippingCategory = Pick<CategoryInfo, "fulfilment" | "allowedShippingModes" | "defaultParcel">;

/**
 * Modes offered for this order: the category's allowed modes, with PDD
 * direct-ship only for PDD links. Digital categories never ship.
 */
export function availableShippingModes(
  platform: Platform,
  pathType: PathType,
  category: Pick<CategoryInfo, "fulfilment" | "allowedShippingModes">,
): ShippingMode[] {
  if (pathType === "digital" || category.fulfilment === "digital") return ["none"];
  const allowed = new Set(category.allowedShippingModes);
  const batch = (["air", "air_sensitive", "sea"] as const).filter((m) => allowed.has(m));
  return platform === "pdd" && allowed.has("pdd_direct") ? ["pdd_direct", ...batch] : batch;
}

export interface ShippingOptionsInput {
  platform: Platform;
  pathType: PathType;
  category: ShippingCategory;
  quantity: number;
  settings: Settings;
  fxRate: FxRateMicro;
  /** Earliest open batch cutoff per mode (future only). */
  nextCutoffs: Partial<Record<BatchShippingMode, Date>>;
  now: Date;
}

export function shippingOptions(input: ShippingOptionsInput): ShippingOption[] {
  const modes = availableShippingModes(input.platform, input.pathType, input.category);
  const transit = input.settings.shipping.transitDays;

  return modes.map((mode): ShippingOption => {
    const base = { mode, label: SHIPPING_MODE_LABELS[mode] };
    if (mode === "none") {
      return { ...base, minSen: 0, maxSen: 0, etaDaysMin: null, etaDaysMax: null, cutoffAt: null, note: "Delivered by email" };
    }
    if (mode === "pdd_direct") {
      return {
        ...base,
        minSen: 0,
        maxSen: 0,
        etaDaysMin: transit.pdd_direct.min,
        etaDaysMax: transit.pdd_direct.max,
        cutoffAt: null,
        note: "Delivery time set by PDD. No forwarder shipping to pay.",
      };
    }

    const est = estimateShipping({
      mode,
      parcel: input.category.defaultParcel,
      source: "category_default",
      quantity: input.quantity,
      fxRate: input.fxRate,
      settings: input.settings,
    });
    const cutoff = isBatchShippingMode(mode) ? input.nextCutoffs[mode] : undefined;
    const waitDays = cutoff ? Math.max(0, Math.ceil((cutoff.getTime() - input.now.getTime()) / DAY_MS)) : null;
    const days = transit[mode];
    return {
      ...base,
      minSen: est.minSen,
      maxSen: est.maxSen,
      etaDaysMin: waitDays === null ? null : waitDays + days.min,
      etaDaysMax: waitDays === null ? null : waitDays + days.max,
      cutoffAt: cutoff ? cutoff.toISOString() : null,
      note:
        mode === "air_sensitive"
          ? "For batteries, liquids, perfume, cosmetics with alcohol and magnets."
          : cutoff
            ? null
            : "Next batch not scheduled yet.",
    };
  });
}

export function buildShippingSnapshot(
  chosen: ShippingMode,
  category: string,
  options: readonly ShippingOption[],
  now: Date,
): ShippingChoiceSnapshot {
  return {
    chosen,
    category,
    capturedAt: now.toISOString(),
    options: options.map((o) => ({
      mode: o.mode,
      minSen: o.minSen,
      maxSen: o.maxSen,
      etaDaysMin: o.etaDaysMin,
      etaDaysMax: o.etaDaysMax,
    })),
  };
}
