import type { Catalog } from "../../domain/catalog";
import { definitionSchema, type CategoryDefinitionInput } from "../../domain/categoryDefinition";
import type { MeasurementDef } from "../../domain/categorySchema";
import type { CategoryFulfilment, MeasurementGroup, MeasurementUnit, ShippingMode } from "../../domain/enums";

// Starting categories and measurement library, converted from the old code
// registry. Migration 0004 loads exactly this data (as SQL), so fresh installs
// and tests start with it; after that, everything is edited in
// Settings → Categories. Don't change existing entries here to change the live
// site — publish a new version from the admin instead.

export interface SeedMeasurement {
  key: string;
  label: string;
  unit: MeasurementUnit;
  min: number;
  max: number;
  step: number;
  helpText?: string;
  group: MeasurementGroup;
  sortOrder: number;
}

export const SEED_MEASUREMENTS: SeedMeasurement[] = [
  { key: "chest_cm", label: "Chest", unit: "cm", min: 50, max: 200, step: 0.5, group: "upper_body", sortOrder: 10, helpText: "Measure around the fullest part of your chest." },
  { key: "shoulder_cm", label: "Shoulder width", unit: "cm", min: 25, max: 80, step: 0.5, group: "upper_body", sortOrder: 20 },
  { key: "arm_length_cm", label: "Arm length", unit: "cm", min: 30, max: 100, step: 0.5, group: "upper_body", sortOrder: 30, helpText: "Shoulder point to wrist." },
  { key: "body_length_cm", label: "Body length", unit: "cm", min: 40, max: 120, step: 0.5, group: "upper_body", sortOrder: 40, helpText: "Top of shoulder to hem." },
  { key: "underbust_cm", label: "Underbust", unit: "cm", min: 50, max: 150, step: 0.5, group: "upper_body", sortOrder: 50 },
  { key: "overbust_cm", label: "Overbust", unit: "cm", min: 60, max: 180, step: 0.5, group: "upper_body", sortOrder: 60 },
  { key: "waist_cm", label: "Waist", unit: "cm", min: 40, max: 200, step: 0.5, group: "lower_body", sortOrder: 10 },
  { key: "hip_cm", label: "Hip", unit: "cm", min: 50, max: 200, step: 0.5, group: "lower_body", sortOrder: 20 },
  { key: "inseam_cm", label: "Inseam", unit: "cm", min: 30, max: 110, step: 0.5, group: "lower_body", sortOrder: 30, helpText: "Crotch to ankle along the inside leg." },
  { key: "foot_length_cm", label: "Foot length", unit: "cm", min: 10, max: 35, step: 0.1, group: "feet", sortOrder: 10, helpText: "Heel to longest toe, standing." },
  { key: "ring_inner_circumference_mm", label: "Ring inner circumference", unit: "mm", min: 35, max: 80, step: 0.5, group: "hands", sortOrder: 10, helpText: "Wrap a paper strip around your finger and measure it." },
  { key: "pd_mm", label: "Pupillary distance", unit: "mm", min: 40, max: 80, step: 0.5, group: "other", sortOrder: 10, helpText: "The distance between the centres of your pupils. It's on most prescriptions." },
];

export interface SeedCategory {
  key: string;
  name: string;
  icon: string;
  sortOrder: number;
  fulfilment: CategoryFulfilment;
  /** Per-item default parcel: grams and millimetres. */
  defaultWeightG: number;
  defaultLengthMm: number;
  defaultWidthMm: number;
  defaultHeightMm: number;
  allowedShippingModes: ShippingMode[];
  restrictedNote?: string;
  definition: CategoryDefinitionInput;
}

const PHYSICAL: ShippingMode[] = ["air", "air_sensitive", "sea", "pdd_direct"];

const m = (measurementKey: string, extra: { mustExceed?: string } = {}) => ({
  kind: "measurement" as const,
  measurementKey,
  required: true,
  ...extra,
});
const dioptre = (key: string, label: string, min: number, max: number) => ({
  kind: "number" as const,
  key,
  label,
  unit: "D",
  min,
  max,
  step: 0.25,
  required: true,
});
const axis = (side: "left" | "right") => ({
  kind: "number" as const,
  key: `axis_${side}`,
  label: `Axis ${side}`,
  unit: "°",
  min: 0,
  max: 180,
  step: 1,
  helpText: "Only needed if CYL is not 0.",
  requiredIf: { field: `cyl_${side}`, op: "neq" as const, value: 0 },
});

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    key: "clothing_top",
    name: "Clothing — top",
    icon: "Shirt",
    sortOrder: 10,
    fulfilment: "physical",
    defaultWeightG: 350,
    defaultLengthMm: 300,
    defaultWidthMm: 250,
    defaultHeightMm: 50,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [{ title: "Your measurements", fields: [m("chest_cm"), m("shoulder_cm"), m("arm_length_cm"), m("body_length_cm")] }],
    },
  },
  {
    key: "clothing_bottom",
    name: "Clothing — bottom",
    icon: "Ruler",
    sortOrder: 20,
    fulfilment: "physical",
    defaultWeightG: 550,
    defaultLengthMm: 350,
    defaultWidthMm: 250,
    defaultHeightMm: 60,
    allowedShippingModes: PHYSICAL,
    definition: { sections: [{ title: "Your measurements", fields: [m("waist_cm"), m("hip_cm"), m("inseam_cm")] }] },
  },
  {
    key: "dress",
    name: "Dress",
    icon: "Sparkle",
    sortOrder: 30,
    fulfilment: "physical",
    defaultWeightG: 450,
    defaultLengthMm: 350,
    defaultWidthMm: 250,
    defaultHeightMm: 60,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [
        {
          title: "Your measurements",
          fields: [
            m("chest_cm"),
            m("waist_cm"),
            m("hip_cm"),
            { kind: "number", key: "length_cm", label: "Dress length", unit: "cm", min: 50, max: 180, step: 0.5, required: true, helpText: "Preferred length, shoulder to hem." },
          ],
        },
      ],
    },
  },
  {
    key: "bra",
    name: "Bra",
    icon: "Heart",
    sortOrder: 40,
    fulfilment: "physical",
    defaultWeightG: 150,
    defaultLengthMm: 250,
    defaultWidthMm: 180,
    defaultHeightMm: 60,
    allowedShippingModes: PHYSICAL,
    definition: { sections: [{ title: "Your measurements", fields: [m("underbust_cm"), m("overbust_cm", { mustExceed: "underbust_cm" })] }] },
  },
  {
    key: "shoes",
    name: "Shoes",
    icon: "Footprints",
    sortOrder: 50,
    fulfilment: "physical",
    defaultWeightG: 1200,
    defaultLengthMm: 350,
    defaultWidthMm: 250,
    defaultHeightMm: 130,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [
        {
          title: "Your size",
          fields: [
            { kind: "text", key: "size", label: "Size", maxLength: 10, placeholder: "e.g. 38 or 8.5", required: true },
            { kind: "select", key: "size_system", label: "Size system", options: ["UK", "US", "EU", "CN"], required: true },
            m("foot_length_cm"),
          ],
        },
      ],
    },
  },
  {
    key: "ring",
    name: "Ring",
    icon: "Gem",
    sortOrder: 60,
    fulfilment: "physical",
    defaultWeightG: 40,
    defaultLengthMm: 80,
    defaultWidthMm: 80,
    defaultHeightMm: 50,
    allowedShippingModes: PHYSICAL,
    definition: { sections: [{ title: "Your size", fields: [m("ring_inner_circumference_mm")] }] },
  },
  {
    key: "glasses_prescription",
    name: "Prescription glasses",
    icon: "Glasses",
    sortOrder: 70,
    fulfilment: "physical",
    defaultWeightG: 150,
    defaultLengthMm: 160,
    defaultWidthMm: 70,
    defaultHeightMm: 50,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [
        {
          title: "Your prescription",
          fields: [
            dioptre("sph_left", "SPH left", -20, 20),
            dioptre("sph_right", "SPH right", -20, 20),
            dioptre("cyl_left", "CYL left", -10, 10),
            dioptre("cyl_right", "CYL right", -10, 10),
            axis("left"),
            axis("right"),
            m("pd_mm"),
          ],
        },
      ],
    },
  },
  {
    key: "contact_lens",
    name: "Contact lenses",
    icon: "Eye",
    sortOrder: 80,
    fulfilment: "physical",
    defaultWeightG: 80,
    defaultLengthMm: 100,
    defaultWidthMm: 80,
    defaultHeightMm: 40,
    allowedShippingModes: ["air_sensitive", "sea"],
    restrictedNote: "Lens solution is a liquid, so contact lenses ship on the sensitive air line or by sea.",
    definition: {
      option: { label: "Colour", required: true },
      sections: [
        {
          title: "Your prescription",
          fields: [
            dioptre("sph_left", "SPH left", -20, 20),
            dioptre("sph_right", "SPH right", -20, 20),
            { kind: "number", key: "base_curve", label: "Base curve", unit: "mm", min: 7, max: 10, step: 0.1 },
          ],
        },
      ],
    },
  },
  {
    key: "cosmetics",
    name: "Cosmetics",
    icon: "Palette",
    sortOrder: 90,
    fulfilment: "physical",
    defaultWeightG: 200,
    defaultLengthMm: 120,
    defaultWidthMm: 100,
    defaultHeightMm: 40,
    allowedShippingModes: PHYSICAL,
    definition: { option: { label: "Shade", required: true }, sections: [] },
  },
  {
    key: "electronics",
    name: "Electronics",
    icon: "Smartphone",
    sortOrder: 100,
    fulfilment: "physical",
    defaultWeightG: 800,
    defaultLengthMm: 250,
    defaultWidthMm: 200,
    defaultHeightMm: 100,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [
        {
          title: "The item",
          fields: [
            { kind: "text", key: "model", label: "Model", maxLength: 120, required: true },
            { kind: "textarea", key: "spec_notes", label: "Specs", maxLength: 1000, required: true, helpText: "Storage, colour, version, anything that matters." },
            { kind: "text", key: "voltage_plug_note", label: "Voltage / plug", maxLength: 200, required: true, helpText: "Malaysia uses 240V and UK-style (type G) plugs." },
          ],
        },
      ],
    },
  },
  {
    key: "digital",
    name: "Digital product",
    icon: "Download",
    sortOrder: 110,
    fulfilment: "digital",
    defaultWeightG: 0,
    defaultLengthMm: 0,
    defaultWidthMm: 0,
    defaultHeightMm: 0,
    allowedShippingModes: ["none"],
    definition: {
      sections: [
        {
          title: "Delivery",
          fields: [
            { kind: "text", key: "region", label: "Region / server", maxLength: 80, required: true },
            { kind: "text", key: "delivery_email", label: "Delivery email", maxLength: 254, format: "email", required: true },
          ],
        },
      ],
    },
  },
  {
    key: "other",
    name: "Something else",
    icon: "Package",
    sortOrder: 120,
    fulfilment: "physical",
    defaultWeightG: 500,
    defaultLengthMm: 300,
    defaultWidthMm: 200,
    defaultHeightMm: 100,
    allowedShippingModes: PHYSICAL,
    definition: {
      sections: [
        {
          title: "Tell us more",
          fields: [
            { kind: "textarea", key: "description", label: "Description", maxLength: 2000, required: true, helpText: "Tell us what you need and anything we should check with the seller." },
          ],
        },
      ],
    },
  },
];

/** Old field keys renamed in v1 (applied to existing orders by the migration). */
export const RENAMED_DETAIL_KEYS: Record<string, Record<string, string>> = {
  ring: { inner_circumference_mm: "ring_inner_circumference_mm" },
};

/** The seed as an in-memory catalogue (version 1 of everything), for pure domain tests. */
export function seedCatalog(): Catalog {
  const measurements: MeasurementDef[] = SEED_MEASUREMENTS.map((m) => ({
    ...m,
    helpText: m.helpText ?? null,
    helpImageKey: null,
    isActive: true,
  }));
  return {
    measurements,
    categories: SEED_CATEGORIES.map((c) => ({
      id: `cat-${c.key}`,
      key: c.key,
      name: c.name,
      icon: c.icon,
      fulfilment: c.fulfilment,
      defaultParcel: { weightG: c.defaultWeightG, lengthMm: c.defaultLengthMm, widthMm: c.defaultWidthMm, heightMm: c.defaultHeightMm },
      allowedShippingModes: c.allowedShippingModes,
      restrictedNote: c.restrictedNote ?? null,
      versionId: `ver-${c.key}-1`,
      version: 1,
      definition: definitionSchema.parse(c.definition),
    })),
  };
}
