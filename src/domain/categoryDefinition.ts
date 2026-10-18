import { z } from "zod";

// The format of `category_versions.definition`: what fields a category's order
// form asks for. Admins edit it in Settings → Categories, so this meta-schema is
// the gate: nothing is saved unless it passes. It is deliberately limited — no
// regex, no expressions, no code — so a definition can't inject anything or
// hang the validator. Conditions are a fixed set of comparisons against a field
// that appears *earlier* in the form, which also rules out cycles.

/** Field keys: lowercase snake_case. A fixed pattern, never admin-supplied. */
export const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
/** Reserved for the order's own columns. */
const RESERVED_KEYS = new Set(["variant_text", "category", "details", "quantity"]);

export const FIELD_KINDS = ["measurement", "number", "text", "textarea", "select", "multiselect", "boolean"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const CONDITION_OPS = ["eq", "neq", "gt", "lt", "in"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

const fieldKey = z.string().regex(FIELD_KEY_RE, "Use lowercase letters, numbers and _, starting with a letter (max 40)");
const label = z.string().trim().min(1, "Add a label").max(80);
const helpText = z.string().trim().max(300).optional();
/** Help images are uploaded by an admin through the image pipeline. */
const helpImageKey = z
  .string()
  .regex(/^admin\/help\/[0-9a-f-]{36}\.webp$/, "Upload the help image again")
  .optional();
const finite = z.number().finite();

const scalar = z.union([z.string().max(100), finite, z.boolean()]);

export const conditionSchema = z
  .strictObject({
    field: fieldKey,
    op: z.enum(CONDITION_OPS),
    value: z.union([scalar, z.array(z.union([z.string().max(100), finite])).min(1).max(50)]),
  })
  .refine((c) => (c.op === "in") === Array.isArray(c.value), "“in” takes a list; the other operators take one value")
  .refine((c) => !(c.op === "gt" || c.op === "lt") || typeof c.value === "number", "“gt” and “lt” compare numbers");
export type Condition = z.infer<typeof conditionSchema>;

const common = {
  required: z.boolean().default(false),
  requiredIf: conditionSchema.optional(),
  showIf: conditionSchema.optional(),
  helpText,
  helpImageKey,
};

const options = z
  .array(z.string().trim().min(1).max(60))
  .min(1, "Add at least one option")
  .max(50)
  .refine((o) => new Set(o).size === o.length, "Options must be unique");

const numberBounds = {
  min: finite,
  max: finite,
  step: z.number().finite().positive("Step must be above 0"),
};

export const fieldSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("measurement"),
    /** Key in `measurement_definitions`; also the field key (so saved measurements line up). */
    measurementKey: fieldKey,
    /** Must be larger than this earlier number/measurement field (e.g. overbust > underbust). */
    mustExceed: fieldKey.optional(),
    ...common,
  }),
  z.strictObject({
    kind: z.literal("number"),
    key: fieldKey,
    label,
    unit: z.string().trim().max(8).optional(),
    ...numberBounds,
    mustExceed: fieldKey.optional(),
    placeholder: z.string().max(80).optional(),
    ...common,
  }),
  z.strictObject({
    kind: z.literal("text"),
    key: fieldKey,
    label,
    maxLength: z.number().int().min(1).max(2000).default(200),
    /** Built-in format check (no custom patterns). */
    format: z.enum(["email"]).optional(),
    placeholder: z.string().max(80).optional(),
    ...common,
  }),
  z.strictObject({
    kind: z.literal("textarea"),
    key: fieldKey,
    label,
    maxLength: z.number().int().min(1).max(5000).default(1000),
    placeholder: z.string().max(80).optional(),
    ...common,
  }),
  z.strictObject({ kind: z.literal("select"), key: fieldKey, label, options, ...common }),
  z.strictObject({
    kind: z.literal("multiselect"),
    key: fieldKey,
    label,
    options,
    maxSelected: z.number().int().min(1).max(50).optional(),
    ...common,
  }),
  z.strictObject({ kind: z.literal("boolean"), key: fieldKey, label, ...common }),
]);
export type FieldDef = z.infer<typeof fieldSchema>;
export type FieldDefInput = z.input<typeof fieldSchema>;

/** Field key: measurement fields are keyed by their measurement. */
export function keyOf(f: Pick<FieldDef, "kind"> & { key?: string; measurementKey?: string }): string {
  return f.kind === "measurement" ? f.measurementKey! : f.key!;
}

const sectionSchema = z.strictObject({
  title: z.string().trim().max(80).default(""),
  fields: z.array(fieldSchema).max(40),
});

export const definitionSchema = z
  .strictObject({
    sections: z.array(sectionSchema).max(10),
    /**
     * The order's free-text option line (`orders.variant_text`): colour, size,
     * shade. `required` makes it mandatory under this label.
     */
    option: z
      .strictObject({ label, required: z.boolean().default(false), helpText })
      .optional(),
  })
  .superRefine((def, ctx) => {
    const seen = new Map<string, FieldDef>();
    let total = 0;
    def.sections.forEach((section, s) =>
      section.fields.forEach((field, f) => {
        const path = ["sections", s, "fields", f];
        const key = keyOf(field);
        total++;
        if (RESERVED_KEYS.has(key)) ctx.addIssue({ code: "custom", path, message: `“${key}” is reserved` });
        if (seen.has(key)) ctx.addIssue({ code: "custom", path, message: `The key “${key}” is used twice` });

        if (field.kind === "number") {
          if (field.min >= field.max) ctx.addIssue({ code: "custom", path, message: "Min must be below max" });
          else if ((field.max - field.min) / field.step > 1_000_000)
            ctx.addIssue({ code: "custom", path, message: "Step is too small for this range" });
        }
        if (field.required && field.requiredIf) {
          ctx.addIssue({ code: "custom", path, message: "Use “required” or “required if”, not both" });
        }

        // Conditions and comparisons may only look at fields above this one.
        for (const rule of ["requiredIf", "showIf"] as const) {
          const cond = field[rule];
          if (!cond) continue;
          const target = seen.get(cond.field);
          if (!target) {
            ctx.addIssue({ code: "custom", path: [...path, rule], message: `“${cond.field}” must be a field above this one` });
            continue;
          }
          if ((cond.op === "gt" || cond.op === "lt") && target.kind !== "number" && target.kind !== "measurement") {
            ctx.addIssue({ code: "custom", path: [...path, rule], message: "“gt” and “lt” only work on number fields" });
          }
          if ((target.kind === "select" || target.kind === "multiselect") && cond.op !== "gt" && cond.op !== "lt") {
            const wanted = Array.isArray(cond.value) ? cond.value : [cond.value];
            const bad = wanted.find((v) => !target.options.includes(String(v)));
            if (bad !== undefined)
              ctx.addIssue({ code: "custom", path: [...path, rule], message: `“${bad}” isn't an option of “${cond.field}”` });
          }
        }
        if ((field.kind === "number" || field.kind === "measurement") && field.mustExceed) {
          const target = seen.get(field.mustExceed);
          if (!target || (target.kind !== "number" && target.kind !== "measurement")) {
            ctx.addIssue({
              code: "custom",
              path: [...path, "mustExceed"],
              message: `“${field.mustExceed}” must be a number field above this one`,
            });
          }
        }
        seen.set(key, field);
      }),
    );
    if (total > 60) ctx.addIssue({ code: "custom", path: ["sections"], message: "At most 60 fields per category" });
  });

export type CategoryDefinition = z.output<typeof definitionSchema>;
export type CategoryDefinitionInput = z.input<typeof definitionSchema>;

export function allFields(def: CategoryDefinition): FieldDef[] {
  return def.sections.flatMap((s) => s.fields);
}

export function measurementKeysOf(def: CategoryDefinition): string[] {
  return allFields(def)
    .filter((f) => f.kind === "measurement")
    .map((f) => f.measurementKey);
}

/**
 * Checks that need the measurement library: every measurement a definition
 * uses must exist (and, for publishing, be active).
 */
export function measurementRefErrors(
  def: CategoryDefinition,
  library: ReadonlyArray<{ key: string; isActive: boolean }>,
  { requireActive = true } = {},
): string[] {
  const byKey = new Map(library.map((m) => [m.key, m]));
  const errors: string[] = [];
  for (const key of measurementKeysOf(def)) {
    const m = byKey.get(key);
    if (!m) errors.push(`Unknown measurement “${key}”`);
    else if (requireActive && !m.isActive) errors.push(`Measurement “${key}” is switched off`);
  }
  return errors;
}

export interface DefinitionDiff {
  added: string[];
  removed: string[];
  changed: Array<{ key: string; what: string[] }>;
  optionChanged: boolean;
}

/** Fields added, removed and changed between two versions (for the publish dialog). */
export function diffDefinitions(before: CategoryDefinition | null, after: CategoryDefinition): DefinitionDiff {
  const a = new Map((before ? allFields(before) : []).map((f) => [keyOf(f), f]));
  const b = new Map(allFields(after).map((f) => [keyOf(f), f]));
  const changed: DefinitionDiff["changed"] = [];
  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev) continue;
    const props = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const what = [...props].filter(
      (p) => JSON.stringify((prev as Record<string, unknown>)[p]) !== JSON.stringify((next as Record<string, unknown>)[p]),
    );
    if (what.length) changed.push({ key, what });
  }
  return {
    added: [...b.keys()].filter((k) => !a.has(k)),
    removed: [...a.keys()].filter((k) => !b.has(k)),
    changed,
    optionChanged: JSON.stringify(before?.option ?? null) !== JSON.stringify(after.option ?? null),
  };
}

/** Keys from `before` that `after` must keep (keys are immutable once published). */
export function removedPublishedKeys(published: CategoryDefinition | null, draft: CategoryDefinition): string[] {
  return diffDefinitions(published, draft).removed;
}

/**
 * Field keys are immutable once published: a key used by any earlier version
 * may be dropped from a new version, but if it comes back it must keep its
 * kind (so old orders' values still mean the same thing).
 */
export function keyKindConflicts(previous: readonly CategoryDefinition[], draft: CategoryDefinition): string[] {
  const kinds = new Map<string, FieldDef["kind"]>();
  for (const def of previous) for (const f of allFields(def)) kinds.set(keyOf(f), f.kind);
  return allFields(draft)
    .filter((f) => kinds.has(keyOf(f)) && kinds.get(keyOf(f)) !== f.kind)
    .map((f) => `“${keyOf(f)}” was a ${kinds.get(keyOf(f))} field before; use a new key for a ${f.kind} field`);
}
