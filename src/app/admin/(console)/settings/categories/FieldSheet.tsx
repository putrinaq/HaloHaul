"use client";

import { useId, useState } from "react";
import { ErrorNote } from "@/components/admin/dialogs/shared";
import { ImagesInput, type UploadedImage } from "@/components/admin/ImagesInput";
import { Sheet } from "@/components/admin/Sheet";
import { Field } from "@/components/admin/ui";
import { CONDITION_OPS, fieldSchema, keyOf, type Condition, type ConditionOp, type FieldDef, type FieldKind } from "@/domain/categoryDefinition";
import { MEASUREMENT_GROUP_LABELS, type MeasurementDef } from "@/domain/categorySchema";

export const KIND_LABELS: Record<FieldKind, string> = {
  measurement: "Measurement (from the library)",
  number: "Number",
  text: "Short text",
  textarea: "Long text",
  select: "Choose one",
  multiselect: "Choose several",
  boolean: "Yes / no",
};

/** A starting point for a new field of this kind. */
export function newField(kind: FieldKind, library: readonly MeasurementDef[], taken: Set<string>): FieldDef {
  const freeKey = (base: string) => {
    let k = base;
    for (let i = 2; taken.has(k); i++) k = `${base}_${i}`;
    return k;
  };
  switch (kind) {
    case "measurement":
      return { kind, measurementKey: library.find((m) => m.isActive && !taken.has(m.key))?.key ?? library[0]?.key ?? "chest_cm", required: true };
    case "number":
      return { kind, key: freeKey("number"), label: "Number", min: 0, max: 100, step: 1, required: false };
    case "text":
      return { kind, key: freeKey("text"), label: "Text", maxLength: 200, required: false };
    case "textarea":
      return { kind, key: freeKey("notes"), label: "Notes", maxLength: 1000, required: false };
    case "select":
      return { kind, key: freeKey("choice"), label: "Choice", options: ["Option A", "Option B"], required: false };
    case "multiselect":
      return { kind, key: freeKey("choices"), label: "Choices", options: ["Option A", "Option B"], required: false };
    case "boolean":
      return { kind, key: freeKey("confirm"), label: "Yes or no", required: false };
  }
}

/** Edits one field. Conditions can only look at fields above it (`earlier`). */
export function FieldSheet({
  field,
  earlier,
  library,
  lockedKeys,
  takenKeys,
  imageUrls,
  onSave,
  onClose,
}: {
  field: FieldDef;
  earlier: FieldDef[];
  library: readonly MeasurementDef[];
  lockedKeys: Set<string>;
  takenKeys: Set<string>;
  imageUrls: Record<string, string>;
  onSave: (f: FieldDef, image?: UploadedImage | null) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [f, setF] = useState<Record<string, unknown>>({ ...field });
  const [optionsText, setOptionsText] = useState("options" in field ? field.options.join("\n") : "");
  const [image, setImage] = useState<UploadedImage[]>(field.helpImageKey && imageUrls[field.helpImageKey] ? [{ key: field.helpImageKey, url: imageUrls[field.helpImageKey] }] : []);
  const [error, setError] = useState<string | null>(null);
  const originalKey = keyOf(field);
  const keyLocked = lockedKeys.has(originalKey);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v === "" ? undefined : v }));
  const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const kind = field.kind;

  function save() {
    const candidate: Record<string, unknown> = { ...f, helpImageKey: image[0]?.key };
    if (kind === "select" || kind === "multiselect") candidate.options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    for (const k of Object.keys(candidate)) if (candidate[k] === undefined) delete candidate[k];
    const parsed = fieldSchema.safeParse(candidate);
    if (!parsed.success) return setError(parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join("; "));
    const newKey = keyOf(parsed.data);
    if (newKey !== originalKey && takenKeys.has(newKey)) return setError(`The key “${newKey}” is already used in this form.`);
    onSave(parsed.data, image[0] ?? null);
  }

  const numberLike = earlier.filter((e) => e.kind === "number" || e.kind === "measurement");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={KIND_LABELS[kind]} description="Changes apply to the draft; publish to show them to students." size="lg">
      <div className="space-y-5">
        {kind === "measurement" ? (
          <Field label="Measurement" htmlFor={`${id}-m`} hint="Label, unit and limits come from the library." error={keyLocked ? null : undefined}>
            <select id={`${id}-m`} value={String(f.measurementKey)} disabled={keyLocked} onChange={(e) => set("measurementKey", e.target.value)} className="admin-input">
              {Object.entries(MEASUREMENT_GROUP_LABELS).map(([g, label]) => (
                <optgroup key={g} label={label}>
                  {library
                    .filter((m) => m.group === g && (m.isActive || m.key === f.measurementKey))
                    .map((m) => (
                      <option key={m.key} value={m.key} disabled={m.key !== originalKey && takenKeys.has(m.key)}>
                        {m.label} ({m.min}–{m.max} {m.unit})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" htmlFor={`${id}-l`}>
              <input id={`${id}-l`} value={String(f.label ?? "")} onChange={(e) => set("label", e.target.value)} className="admin-input" />
            </Field>
            <Field label="Key" htmlFor={`${id}-k`} hint={keyLocked ? "Published already: the key can't change." : "Lowercase, e.g. sleeve_cm."}>
              <input id={`${id}-k`} value={String(f.key ?? "")} disabled={keyLocked} onChange={(e) => set("key", e.target.value)} className="admin-input font-mono" />
            </Field>
          </div>
        )}

        {kind === "number" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {(["unit", "min", "max", "step"] as const).map((k) => (
              <Field key={k} label={{ unit: "Unit", min: "Minimum", max: "Maximum", step: "Step" }[k]} htmlFor={`${id}-${k}`}>
                <input
                  id={`${id}-${k}`}
                  inputMode={k === "unit" ? "text" : "decimal"}
                  defaultValue={f[k] === undefined ? "" : String(f[k])}
                  onChange={(e) => set(k, k === "unit" ? e.target.value : numOrUndef(e.target.value))}
                  className="admin-input"
                />
              </Field>
            ))}
          </div>
        ) : null}

        {kind === "text" || kind === "textarea" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max characters" htmlFor={`${id}-ml`}>
              <input id={`${id}-ml`} inputMode="numeric" defaultValue={String(f.maxLength ?? "")} onChange={(e) => set("maxLength", numOrUndef(e.target.value))} className="admin-input" />
            </Field>
            <Field label="Placeholder — optional" htmlFor={`${id}-ph`}>
              <input id={`${id}-ph`} defaultValue={String(f.placeholder ?? "")} onChange={(e) => set("placeholder", e.target.value)} className="admin-input" />
            </Field>
            {kind === "text" ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={f.format === "email"} onChange={(e) => set("format", e.target.checked ? "email" : undefined)} className="size-5 accent-sky-500" />
                Must be an email address
              </label>
            ) : null}
          </div>
        ) : null}

        {kind === "select" || kind === "multiselect" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Options (one per line)" htmlFor={`${id}-o`} className="sm:col-span-2">
              <textarea id={`${id}-o`} rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} className="admin-input" />
            </Field>
            {kind === "multiselect" ? (
              <Field label="Most they can pick — optional" htmlFor={`${id}-mx`}>
                <input id={`${id}-mx`} inputMode="numeric" defaultValue={String(f.maxSelected ?? "")} onChange={(e) => set("maxSelected", numOrUndef(e.target.value))} className="admin-input" />
              </Field>
            ) : null}
          </div>
        ) : null}

        {(kind === "number" || kind === "measurement") && numberLike.length ? (
          <Field label="Must be larger than — optional" htmlFor={`${id}-me`} hint="e.g. overbust must be larger than underbust.">
            <select id={`${id}-me`} value={String(f.mustExceed ?? "")} onChange={(e) => set("mustExceed", e.target.value)} className="admin-input">
              <option value="">No comparison</option>
              {numberLike.map((e) => (
                <option key={keyOf(e)} value={keyOf(e)}>
                  {labelOf(e, library)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <fieldset className="space-y-3 rounded-2xl border border-white/10 p-4">
          <legend className="px-1 text-sm font-medium">When is it needed?</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["optional", "Optional"],
                ["required", kind === "boolean" ? "Must be ticked" : "Always required"],
                ["requiredIf", "Required if…"],
              ] as const
            ).map(([mode, label]) => {
              const current = f.required ? "required" : f.requiredIf ? "requiredIf" : "optional";
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={current === mode}
                  disabled={mode === "requiredIf" && earlier.length === 0}
                  onClick={() =>
                    setF((s) => ({
                      ...s,
                      required: mode === "required",
                      requiredIf: mode === "requiredIf" ? (s.requiredIf ?? defaultCondition(earlier)) : undefined,
                    }))
                  }
                  className="admin-chip disabled:opacity-40"
                >
                  {label}
                </button>
              );
            })}
          </div>
          {f.requiredIf ? <ConditionEditor value={f.requiredIf as Condition} onChange={(c) => set("requiredIf", c)} earlier={earlier} library={library} /> : null}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              disabled={earlier.length === 0}
              checked={!!f.showIf}
              onChange={(e) => set("showIf", e.target.checked ? defaultCondition(earlier) : undefined)}
              className="size-5 accent-sky-500"
            />
            Only show this field if…
          </label>
          {f.showIf ? <ConditionEditor value={f.showIf as Condition} onChange={(c) => set("showIf", c)} earlier={earlier} library={library} /> : null}
          {earlier.length === 0 ? <p className="text-xs text-white/45">Conditions can only use fields above this one.</p> : null}
        </fieldset>

        <Field label="Help text — optional" htmlFor={`${id}-h`} hint={kind === "measurement" ? "Leave empty to use the library's how-to-measure text." : undefined}>
          <textarea id={`${id}-h`} rows={2} defaultValue={String(f.helpText ?? "")} onChange={(e) => set("helpText", e.target.value)} className="admin-input" />
        </Field>
        <Field label="Help picture — optional" htmlFor={`${id}-img`}>
          <ImagesInput value={image} onChange={setImage} purpose="help" max={1} />
        </Field>

        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="admin-btn-primary" onClick={save}>
            Done
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function labelOf(f: FieldDef, library: readonly MeasurementDef[]): string {
  if (f.kind === "measurement") return library.find((m) => m.key === f.measurementKey)?.label ?? f.measurementKey;
  return f.label;
}

function defaultCondition(earlier: FieldDef[]): Condition {
  const target = earlier.at(-1)!;
  if (target.kind === "select" || target.kind === "multiselect") return { field: keyOf(target), op: "eq", value: target.options[0] };
  if (target.kind === "boolean") return { field: keyOf(target), op: "eq", value: true };
  if (target.kind === "number" || target.kind === "measurement") return { field: keyOf(target), op: "neq", value: 0 };
  return { field: keyOf(target), op: "eq", value: "" };
}

const OP_LABELS: Record<ConditionOp, string> = { eq: "is", neq: "is not", gt: "is more than", lt: "is less than", in: "is one of" };

function ConditionEditor({ value, onChange, earlier, library }: { value: Condition; onChange: (c: Condition) => void; earlier: FieldDef[]; library: readonly MeasurementDef[] }) {
  const target = earlier.find((e) => keyOf(e) === value.field) ?? earlier.at(-1)!;
  const numeric = target.kind === "number" || target.kind === "measurement";
  const ops = CONDITION_OPS.filter((op) => (op === "gt" || op === "lt" ? numeric : target.kind === "boolean" ? op === "eq" || op === "neq" : true));
  const options = target.kind === "select" || target.kind === "multiselect" ? target.options : null;

  const setValue = (raw: string) => {
    if (value.op === "in") {
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      return onChange({ ...value, value: numeric ? parts.map(Number) : parts });
    }
    if (target.kind === "boolean") return onChange({ ...value, value: raw === "true" });
    onChange({ ...value, value: numeric ? Number(raw) : raw });
  };

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
      <select
        aria-label="Field"
        value={keyOf(target)}
        onChange={(e) => {
          const t = earlier.find((x) => keyOf(x) === e.target.value)!;
          onChange(defaultCondition([t]));
        }}
        className="admin-input"
      >
        {earlier.map((e) => (
          <option key={keyOf(e)} value={keyOf(e)}>
            {labelOf(e, library)}
          </option>
        ))}
      </select>
      <select
        aria-label="Comparison"
        value={value.op}
        onChange={(e) => {
          const op = e.target.value as ConditionOp;
          const v = op === "in" ? (Array.isArray(value.value) ? value.value : [value.value as string | number]) : Array.isArray(value.value) ? value.value[0] : value.value;
          onChange({ ...value, op, value: v as Condition["value"] });
        }}
        className="admin-input"
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>
      {target.kind === "boolean" ? (
        <select aria-label="Value" value={String(value.value)} onChange={(e) => setValue(e.target.value)} className="admin-input">
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : options && value.op !== "in" ? (
        <select aria-label="Value" value={String(value.value)} onChange={(e) => setValue(e.target.value)} className="admin-input">
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label="Value"
          inputMode={numeric ? "decimal" : "text"}
          defaultValue={Array.isArray(value.value) ? value.value.join(", ") : String(value.value)}
          onChange={(e) => setValue(e.target.value)}
          placeholder={value.op === "in" ? "Comma-separated" : undefined}
          className="admin-input"
        />
      )}
    </div>
  );
}
