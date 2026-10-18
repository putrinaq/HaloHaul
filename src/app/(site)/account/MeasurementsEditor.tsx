"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type FieldErrors, type FieldValues, type Resolver, type UseFormRegister } from "react-hook-form";
import { CategoryFields } from "@/components/category/CategoryFields";
import { Button } from "@/components/ui/button";
import {
  libraryFields,
  MEASUREMENT_GROUP_LABELS,
  validateDetails,
  type MeasurementDef,
  type SavedMeasurements,
} from "@/domain/categorySchema";
import type { MeasurementGroup } from "@/domain/enums";
import { saveMeasurementsAction } from "./actions";

type Values = { details: Record<string, unknown> };

/**
 * Every active measurement in the library, grouped, with how-to-measure help.
 * Saved values prefill any order form that asks for the same measurement.
 */
export function MeasurementsEditor({
  saved,
  library,
  helpImageUrls,
  hasProfile,
}: {
  saved: SavedMeasurements;
  library: MeasurementDef[];
  helpImageUrls: Record<string, string>;
  hasProfile: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const fields = useMemo(() => libraryFields(library), [library]);
  const groups = Object.entries(MEASUREMENT_GROUP_LABELS) as Array<[MeasurementGroup, string]>;

  if (!hasProfile) {
    return <p className="text-sm text-muted-foreground">Save your contact details first, then add measurements here.</p>;
  }
  if (editing) return <EditForm saved={saved} fields={fields} helpImageUrls={helpImageUrls} onDone={() => setEditing(false)} />;

  const savedCount = fields.filter((f) => saved[f.key] !== undefined).length;
  return (
    <div className="space-y-4">
      {savedCount === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing saved yet. Measurements you enter on an order are saved here automatically.</p>
      ) : null}
      {groups.map(([group, label], g) => {
        const inGroup = fields.filter((f) => f.section === g);
        if (inGroup.length === 0) return null;
        return (
          <div key={group} className="rounded-xl border border-white/10 p-4">
            <h3 className="font-medium">{label}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {inGroup.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className={saved[f.key] === undefined ? "text-white/35" : undefined}>
                    {saved[f.key] === undefined ? "—" : `${saved[f.key]} ${f.unit}`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
        {savedCount ? "Edit measurements" : "Add measurements"}
      </Button>
    </div>
  );
}

function EditForm({
  saved,
  fields,
  helpImageUrls,
  onDone,
}: {
  saved: SavedMeasurements;
  fields: ReturnType<typeof libraryFields>;
  helpImageUrls: Record<string, string>;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Same validation as the server action: every value optional, each checked against the library.
  const resolver: Resolver<Values> = async (values) => {
    const r = validateDetails(fields, values.details);
    if (r.ok) return { values: { details: r.value }, errors: {} };
    const details = Object.fromEntries(Object.entries(r.fieldErrors).map(([k, message]) => [k, { type: "validate", message }]));
    return { values: {} as Record<string, never>, errors: { details } as FieldErrors<Values> };
  };
  const form = useForm<Values>({ resolver, defaultValues: { details: saved } });
  const values = useWatch({ control: form.control, name: "details" });
  const groups = Object.values(MEASUREMENT_GROUP_LABELS);

  const onSubmit = form.handleSubmit((data) =>
    start(async () => {
      const res = await saveMeasurementsAction(data.details);
      if (res.ok) return onDone();
      setError(res.error);
      for (const [path, message] of Object.entries(res.fieldErrors ?? {})) form.setError(path as "details", { message });
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {groups.map((label, g) => {
        const inGroup = fields.filter((f) => f.section === g);
        if (inGroup.length === 0) return null;
        return (
          <fieldset key={label} className="space-y-3 rounded-xl border border-white/15 p-4">
            <legend className="px-1 font-medium">{label}</legend>
            <CategoryFields
              fields={inGroup}
              register={form.register as unknown as UseFormRegister<FieldValues>}
              errors={form.formState.errors}
              values={values ?? {}}
              helpImageUrls={helpImageUrls}
              idPrefix="m"
            />
          </fieldset>
        );
      })}
      <p className="text-xs text-muted-foreground">Leave a box empty to remove that measurement.</p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save measurements"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
