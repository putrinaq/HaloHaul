"use client";

import { useId, useState } from "react";
import { CategoryIcon } from "@/components/admin/CategoryIcon";
import { Field } from "@/components/admin/ui";
import { CATEGORY_ICONS } from "@/domain/categoryIcons";
import type { CategoryFulfilment, ShippingMode } from "@/domain/enums";
import { SHIPPING_MODE_LABELS } from "@/domain/labels";
import { cn } from "@/lib/utils";

export interface CategoryInfoValues {
  key: string;
  name: string;
  icon: string;
  fulfilment: CategoryFulfilment;
  defaultWeightG: number;
  defaultLengthMm: number;
  defaultWidthMm: number;
  defaultHeightMm: number;
  allowedShippingModes: ShippingMode[];
  restrictedNote: string | null;
  isActive: boolean;
}

const PHYSICAL_MODES: ShippingMode[] = ["air", "air_sensitive", "sea", "pdd_direct"];

export const blankCategory: CategoryInfoValues = {
  key: "",
  name: "",
  icon: "Package",
  fulfilment: "physical",
  defaultWeightG: 500,
  defaultLengthMm: 300,
  defaultWidthMm: 200,
  defaultHeightMm: 100,
  allowedShippingModes: PHYSICAL_MODES,
  restrictedNote: null,
  isActive: true,
};

/** Basic info for a category: name, icon, fulfilment, default parcel, shipping modes, restricted note. */
export function CategoryInfoForm({
  value,
  onChange,
  isNew,
  fieldErrors,
}: {
  value: CategoryInfoValues;
  onChange: (v: CategoryInfoValues) => void;
  isNew: boolean;
  fieldErrors: Record<string, string>;
}) {
  const id = useId();
  const set = <K extends keyof CategoryInfoValues>(k: K, v: CategoryInfoValues[K]) => onChange({ ...value, [k]: v });
  // Sizes are edited in kg / cm and stored in g / mm.
  const [sizes, setSizes] = useState({
    w: String(value.defaultWeightG / 1000),
    l: String(value.defaultLengthMm / 10),
    wd: String(value.defaultWidthMm / 10),
    h: String(value.defaultHeightMm / 10),
  });
  const setSize = (k: keyof typeof sizes, v: string, field: keyof CategoryInfoValues, factor: number) => {
    setSizes((s) => ({ ...s, [k]: v }));
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) set(field, Math.round(n * factor) as never);
  };
  const digital = value.fulfilment === "digital";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${id}-n`} error={fieldErrors.name}>
          <input id={`${id}-n`} value={value.name} onChange={(e) => set("name", e.target.value)} className="admin-input" />
        </Field>
        <Field label="Key" htmlFor={`${id}-k`} hint={isNew ? "Lowercase, e.g. hat_cap. Can't change after." : "Fixed once created."} error={fieldErrors.key}>
          <input id={`${id}-k`} value={value.key} disabled={!isNew} onChange={(e) => set("key", e.target.value)} className="admin-input font-mono" />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-white/85">Icon</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
          {CATEGORY_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={value.icon === icon}
              aria-label={icon}
              title={icon}
              onClick={() => set("icon", icon)}
              className={cn("grid size-11 place-items-center rounded-xl border transition-colors", value.icon === icon ? "border-white bg-white text-black" : "border-white/15 text-white/70 hover:border-white/40")}
            >
              <CategoryIcon name={icon} className="size-5" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-white/85">Fulfilment</legend>
        <div className="flex gap-2">
          {(["physical", "digital"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={value.fulfilment === f} onClick={() => onChange({ ...value, fulfilment: f, allowedShippingModes: f === "digital" ? ["none"] : PHYSICAL_MODES })} className="admin-chip">
              {f === "physical" ? "Physical (ships)" : "Digital (emailed)"}
            </button>
          ))}
        </div>
      </fieldset>

      {!digital ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-white/85">Default size per item (used for estimates)</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Weight (kg)" htmlFor={`${id}-w`}>
                <input id={`${id}-w`} inputMode="decimal" value={sizes.w} onChange={(e) => setSize("w", e.target.value, "defaultWeightG", 1000)} className="admin-input" />
              </Field>
              <Field label="Length (cm)" htmlFor={`${id}-l`}>
                <input id={`${id}-l`} inputMode="decimal" value={sizes.l} onChange={(e) => setSize("l", e.target.value, "defaultLengthMm", 10)} className="admin-input" />
              </Field>
              <Field label="Width (cm)" htmlFor={`${id}-wd`}>
                <input id={`${id}-wd`} inputMode="decimal" value={sizes.wd} onChange={(e) => setSize("wd", e.target.value, "defaultWidthMm", 10)} className="admin-input" />
              </Field>
              <Field label="Height (cm)" htmlFor={`${id}-h`}>
                <input id={`${id}-h`} inputMode="decimal" value={sizes.h} onChange={(e) => setSize("h", e.target.value, "defaultHeightMm", 10)} className="admin-input" />
              </Field>
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-white/85">Shipping modes students can choose</legend>
            <div className="flex flex-wrap gap-2">
              {PHYSICAL_MODES.map((m) => (
                <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-3 text-sm has-checked:border-white has-checked:bg-white/10">
                  <input
                    type="checkbox"
                    checked={value.allowedShippingModes.includes(m)}
                    onChange={(e) => set("allowedShippingModes", e.target.checked ? [...value.allowedShippingModes, m] : value.allowedShippingModes.filter((x) => x !== m))}
                    className="accent-sky-500"
                  />
                  {SHIPPING_MODE_LABELS[m]}
                </label>
              ))}
            </div>
            {fieldErrors.allowedShippingModes ? <p className="mt-1 text-xs text-destructive">{fieldErrors.allowedShippingModes}</p> : null}
            <p className="mt-1 text-xs text-white/45">PDD direct-ship only shows for PDD links.</p>
          </fieldset>
          <Field label="Shipping note shown to students — optional" htmlFor={`${id}-r`} hint="e.g. why only some modes are allowed.">
            <input id={`${id}-r`} value={value.restrictedNote ?? ""} onChange={(e) => set("restrictedNote", e.target.value || null)} className="admin-input" />
          </Field>
        </>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={value.isActive} onChange={(e) => set("isActive", e.target.checked)} className="size-5 accent-sky-500" />
        Offered on the order form
      </label>
    </div>
  );
}
