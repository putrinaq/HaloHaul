import { z } from "zod";
import type { Parcel } from "../shipping";
import { buildDetailsSchema, cm, dioptre, text, type FieldMeta } from "./fields";

export interface CategoryDefinition {
  key: string;
  version: number;
  label: string;
  /** Measurement categories refuse submission while any required field is missing. */
  measurement: boolean;
  /** Saved to and prefilled from `customer_profiles.saved_measurements`. */
  savesToProfile: boolean;
  /** When set, `orders.variant_text` is required and labelled like this. */
  variantRequired?: { label: string; help?: string };
  fields: readonly FieldMeta[];
  schema: z.ZodType<Record<string, unknown>>;
  /** Per-item default used when the seller hasn't confirmed weight/dimensions. */
  defaultParcel: Parcel;
  /** Digital goods never ship. */
  shippable: boolean;
}

type Def = Omit<CategoryDefinition, "schema"> & {
  extend?: (schema: z.ZodObject) => z.ZodType<Record<string, unknown>>;
};

function define({ extend, ...def }: Def): CategoryDefinition {
  const base = buildDetailsSchema(def.fields);
  const schema = extend ? extend(base) : base;
  return { ...def, schema: schema as z.ZodType<Record<string, unknown>> };
}

const parcel = (weightG: number, l: number, w: number, h: number): Parcel => ({
  weightG,
  lengthMm: l,
  widthMm: w,
  heightMm: h,
});

const AXIS = (key: string, label: string): FieldMeta => ({
  key,
  label,
  input: "number",
  unit: "°",
  min: 0,
  max: 180,
  step: 1,
  help: "Only needed if CYL is not 0.",
  optional: true,
});

/** CYL ≠ 0 means astigmatism, and then the axis is required. */
function requireAxisWhenCyl(schema: z.ZodObject) {
  return schema.superRefine((v, ctx) => {
    for (const side of ["left", "right"] as const) {
      const cyl = v[`cyl_${side}`];
      const axis = v[`axis_${side}`];
      if (typeof cyl === "number" && cyl !== 0 && axis === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [`axis_${side}`],
          message: `Axis ${side} (°) is required when CYL ${side} is not 0`,
        });
      }
    }
  }) as unknown as z.ZodType<Record<string, unknown>>;
}

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  define({
    key: "clothing_top",
    version: 1,
    label: "Clothing — top",
    measurement: true,
    savesToProfile: true,
    fields: [
      cm("chest_cm", "Chest", 50, 200, { help: "Measure around the fullest part of your chest." }),
      cm("shoulder_cm", "Shoulder width", 25, 80),
      cm("arm_length_cm", "Arm length", 30, 100, { help: "Shoulder point to wrist." }),
      cm("body_length_cm", "Body length", 40, 120, { help: "Top of shoulder to hem." }),
    ],
    defaultParcel: parcel(350, 300, 250, 50),
    shippable: true,
  }),
  define({
    key: "clothing_bottom",
    version: 1,
    label: "Clothing — bottom",
    measurement: true,
    savesToProfile: true,
    fields: [
      cm("waist_cm", "Waist", 40, 200),
      cm("hip_cm", "Hip", 50, 200),
      cm("inseam_cm", "Inseam", 30, 110, { help: "Crotch to ankle along the inside leg." }),
    ],
    defaultParcel: parcel(550, 350, 250, 60),
    shippable: true,
  }),
  define({
    key: "dress",
    version: 1,
    label: "Dress",
    measurement: true,
    savesToProfile: true,
    fields: [
      cm("chest_cm", "Chest", 50, 200),
      cm("waist_cm", "Waist", 40, 200),
      cm("hip_cm", "Hip", 50, 200),
      cm("length_cm", "Dress length", 50, 180, { help: "Preferred length, shoulder to hem." }),
    ],
    defaultParcel: parcel(450, 350, 250, 60),
    shippable: true,
  }),
  define({
    key: "bra",
    version: 1,
    label: "Bra",
    measurement: true,
    savesToProfile: true,
    fields: [
      cm("underbust_cm", "Underbust", 50, 150),
      cm("overbust_cm", "Overbust", 60, 180),
    ],
    extend: (s) =>
      s.refine(
        (v) =>
          typeof v.underbust_cm !== "number" ||
          typeof v.overbust_cm !== "number" ||
          v.overbust_cm > v.underbust_cm,
        { path: ["overbust_cm"], message: "Overbust (cm) must be larger than underbust" },
      ) as unknown as z.ZodType<Record<string, unknown>>,
    defaultParcel: parcel(150, 250, 180, 60),
    shippable: true,
  }),
  define({
    key: "shoes",
    version: 1,
    label: "Shoes",
    measurement: true,
    savesToProfile: true,
    fields: [
      text("size", "Size", { maxLength: 10, placeholder: "e.g. 38 or 8.5" }),
      {
        key: "size_system",
        label: "Size system",
        input: "select",
        options: [
          { value: "UK", label: "UK" },
          { value: "US", label: "US" },
          { value: "EU", label: "EU" },
          { value: "CN", label: "CN" },
        ],
      },
      cm("foot_length_cm", "Foot length", 10, 35, {
        step: 0.1,
        help: "Heel to longest toe, standing.",
      }),
    ],
    defaultParcel: parcel(1200, 350, 250, 130),
    shippable: true,
  }),
  define({
    key: "ring",
    version: 1,
    label: "Ring",
    measurement: true,
    savesToProfile: true,
    fields: [
      {
        key: "inner_circumference_mm",
        label: "Inner circumference",
        input: "number",
        unit: "mm",
        min: 35,
        max: 80,
        step: 0.5,
        help: "Wrap a paper strip around your finger and measure it.",
      },
    ],
    defaultParcel: parcel(40, 80, 80, 50),
    shippable: true,
  }),
  define({
    key: "glasses_prescription",
    version: 1,
    label: "Prescription glasses",
    measurement: true,
    savesToProfile: true,
    fields: [
      dioptre("sph_left", "SPH left", -20, 20),
      dioptre("sph_right", "SPH right", -20, 20),
      dioptre("cyl_left", "CYL left", -10, 10),
      dioptre("cyl_right", "CYL right", -10, 10),
      AXIS("axis_left", "Axis left"),
      AXIS("axis_right", "Axis right"),
      {
        key: "pd_mm",
        label: "Pupillary distance",
        input: "number",
        unit: "mm",
        min: 40,
        max: 80,
        step: 0.5,
      },
    ],
    extend: requireAxisWhenCyl,
    defaultParcel: parcel(150, 160, 70, 50),
    shippable: true,
  }),
  define({
    key: "contact_lens",
    version: 1,
    label: "Contact lenses",
    measurement: true,
    savesToProfile: true,
    variantRequired: { label: "Colour" },
    fields: [
      dioptre("sph_left", "SPH left", -20, 20),
      dioptre("sph_right", "SPH right", -20, 20),
      {
        key: "base_curve",
        label: "Base curve",
        input: "number",
        unit: "mm",
        min: 7,
        max: 10,
        step: 0.1,
        optional: true,
      },
    ],
    defaultParcel: parcel(80, 100, 80, 40),
    shippable: true,
  }),
  define({
    key: "cosmetics",
    version: 1,
    label: "Cosmetics",
    measurement: false,
    savesToProfile: false,
    variantRequired: { label: "Shade" },
    fields: [],
    defaultParcel: parcel(200, 120, 100, 40),
    shippable: true,
  }),
  define({
    key: "electronics",
    version: 1,
    label: "Electronics",
    measurement: false,
    savesToProfile: false,
    fields: [
      text("model", "Model", { maxLength: 120 }),
      text("spec_notes", "Specs", {
        input: "textarea",
        maxLength: 1000,
        help: "Storage, colour, version, anything that matters.",
      }),
      text("voltage_plug_note", "Voltage / plug", {
        maxLength: 200,
        help: "Malaysia uses 240V and UK-style (type G) plugs.",
      }),
    ],
    defaultParcel: parcel(800, 250, 200, 100),
    shippable: true,
  }),
  define({
    key: "digital",
    version: 1,
    label: "Digital product",
    measurement: false,
    savesToProfile: false,
    fields: [
      text("region", "Region / server", { maxLength: 80 }),
      { key: "delivery_email", label: "Delivery email", input: "email", maxLength: 254 },
    ],
    defaultParcel: parcel(0, 0, 0, 0),
    shippable: false,
  }),
  define({
    key: "other",
    version: 1,
    label: "Something else",
    measurement: false,
    savesToProfile: false,
    fields: [
      text("description", "Description", {
        input: "textarea",
        maxLength: 2000,
        help: "Tell us what you need and anything we should check with the seller.",
      }),
    ],
    defaultParcel: parcel(500, 300, 200, 100),
    shippable: true,
  }),
];
