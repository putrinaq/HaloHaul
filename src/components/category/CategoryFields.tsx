"use client";

import { get, type FieldErrors, type FieldValues, type UseFormRegister } from "react-hook-form";
import { FieldError } from "@/components/form/FieldError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { visibleKeys, type ResolvedField } from "@/domain/categorySchema";
import { cn } from "@/lib/utils";
import { MeasureGuide, hasMeasureGuide } from "./MeasureGuide";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/**
 * Renders a category version's fields from its stored definition (resolved
 * against the measurement library). The same definition builds the validation
 * that runs here and again on the server. Fields with a `showIf` appear and
 * disappear as `values` change; hidden fields are dropped on submit.
 */
export function CategoryFields({
  fields,
  register,
  errors,
  values,
  helpImageUrls = {},
  prefix = "details",
  idPrefix = "cf",
}: {
  fields: readonly ResolvedField[];
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
  /** Current details values, for show/hide conditions. */
  values: Readonly<Record<string, unknown>>;
  /** Presigned URLs for help images, by image key. */
  helpImageUrls?: Readonly<Record<string, string>>;
  prefix?: string;
  idPrefix?: string;
}) {
  if (fields.length === 0) return null;
  const shown = visibleKeys(fields, values ?? {});
  const sections = [...new Set(fields.map((f) => f.section))];

  return (
    <div className="space-y-6">
      {sections.map((s) => {
        const inSection = fields.filter((f) => f.section === s && shown.has(f.key));
        if (inSection.length === 0) return null;
        return (
          <div key={s} className="grid gap-4 sm:grid-cols-2">
            {inSection.map((f) => (
              <Field key={f.key} f={f} {...{ register, errors, prefix, idPrefix, helpImageUrls }} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  f,
  register,
  errors,
  prefix,
  idPrefix,
  helpImageUrls,
}: {
  f: ResolvedField;
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
  prefix: string;
  idPrefix: string;
  helpImageUrls: Readonly<Record<string, string>>;
}) {
  const name = `${prefix}.${f.key}`;
  const id = `${idPrefix}-${f.key}`;
  const message = get(errors, name)?.message as string | undefined;
  const imageUrl = f.helpImageKey ? helpImageUrls[f.helpImageKey] : undefined;
  const describedBy = [f.helpText ? `${id}-help` : null, message ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    "aria-invalid": message ? true : undefined,
    "aria-describedby": describedBy,
    ...register(name),
  };
  const label = f.unit ? `${f.label} (${f.unit})` : f.label;
  const optional = !f.required && !f.requiredIf;
  const wide = f.kind === "textarea" || f.kind === "multiselect";
  const guide = hasMeasureGuide(f.key, imageUrl) ? <MeasureGuide fieldKey={f.key} label={f.label} imageUrl={imageUrl} /> : null;

  if (f.kind === "boolean") {
    return (
      <div className={cn("space-y-1.5 sm:col-span-2")}>
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-white" {...common} />
            <span>
              {f.label}
              {f.required ? null : <span className="text-muted-foreground"> — optional</span>}
            </span>
          </label>
          {guide}
        </div>
        <Help id={id} f={f} />
        <FieldError id={`${id}-err`} message={message} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <div className="flex items-center gap-1.5">
        {f.kind === "multiselect" ? (
          <p className="text-sm leading-none font-medium" id={`${id}-label`}>
            {label}
            {optional ? <span className="font-normal text-muted-foreground"> — optional</span> : null}
          </p>
        ) : (
          <Label htmlFor={id}>
            {label}
            {optional ? <span className="font-normal text-muted-foreground"> — optional</span> : null}
          </Label>
        )}
        {guide}
      </div>
      {f.kind === "number" || f.kind === "measurement" ? (
        <Input type="number" inputMode="decimal" step={f.step} min={f.min} max={f.max} placeholder={f.placeholder} className="h-11" {...common} />
      ) : f.kind === "select" ? (
        <select className={selectClass} defaultValue="" {...common}>
          <option value="" disabled>
            Choose…
          </option>
          {f.options!.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : f.kind === "multiselect" ? (
        <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-2">
          {f.options!.map((o) => (
            <label key={o} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm has-checked:border-white has-checked:bg-white/10">
              <input type="checkbox" value={o} className="size-4 accent-white" {...register(name)} />
              {o}
            </label>
          ))}
        </div>
      ) : f.kind === "textarea" ? (
        <Textarea rows={4} maxLength={f.maxLength} placeholder={f.placeholder} {...common} />
      ) : (
        <Input type={f.format === "email" ? "email" : "text"} maxLength={f.maxLength} placeholder={f.placeholder} className="h-11" {...common} />
      )}
      <Help id={id} f={f} />
      <FieldError id={`${id}-err`} message={message} />
    </div>
  );
}

/** The short hint under a field. The picture, if any, is in the "i" guide beside the label. */
function Help({ id, f }: { id: string; f: ResolvedField }) {
  if (!f.helpText) return null;
  return (
    <p id={`${id}-help`} className="text-xs text-muted-foreground">
      {f.helpText}
    </p>
  );
}
