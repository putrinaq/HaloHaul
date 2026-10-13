"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, type FieldValues, type Resolver, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { CategoryFields } from "@/components/category/CategoryFields";
import { Button } from "@/components/ui/button";
import { currentCategories, getCategory, type SavedMeasurements } from "@/domain/categories";
import { removeMeasurementsAction, saveMeasurementsAction } from "./actions";

const PROFILE_CATEGORIES = currentCategories().filter((c) => c.savesToProfile);

/** Saved measurements prefill the order form. Same registry schemas as the order form. */
export function MeasurementsEditor({ saved, hasProfile }: { saved: SavedMeasurements; hasProfile: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const savedKeys = Object.keys(saved);
  const unsaved = PROFILE_CATEGORIES.filter((c) => !savedKeys.includes(c.key));

  if (!hasProfile) {
    return <p className="text-sm text-muted-foreground">Save your contact details first, then add measurements here.</p>;
  }

  return (
    <div className="space-y-4">
      {savedKeys.length === 0 && !editing ? (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Measurements you enter on an order are saved here automatically.
        </p>
      ) : null}

      {savedKeys.map((key) => {
        const def = getCategory(key);
        return editing === key ? (
          <CategoryEditor key={key} category={key} values={saved[key]} onDone={() => setEditing(null)} />
        ) : (
          <div key={key} className="rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">{def.label}</h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(key)}>
                  Edit
                </Button>
                <RemoveButton category={key} />
              </div>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {def.fields
                .filter((f) => saved[key][f.key] !== undefined)
                .map((f) => (
                  <div key={f.key}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd>
                      {String(saved[key][f.key])}
                      {f.input === "number" && f.unit ? ` ${f.unit}` : ""}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        );
      })}

      {editing && !savedKeys.includes(editing) ? (
        <CategoryEditor category={editing} values={{}} onDone={() => setEditing(null)} />
      ) : null}

      {!editing && unsaved.length > 0 ? (
        <div className="flex gap-2">
          <select
            aria-label="Add measurements for"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Add measurements for…</option>
            {unsaved.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="lg" disabled={!adding} onClick={() => (setEditing(adding), setAdding(""))}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CategoryEditor({ category, values, onDone }: { category: string; values: Record<string, unknown>; onDone: () => void }) {
  const def = getCategory(category);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  type Values = { details: Record<string, unknown> };
  const form = useForm<Values>({
    // The registry schema coerces the number inputs, so input and output differ.
    resolver: zodResolver(z.object({ details: def.schema })) as unknown as Resolver<Values>,
    defaultValues: { details: values },
  });

  const onSubmit = form.handleSubmit((data) =>
    start(async () => {
      const res = await saveMeasurementsAction(category, data.details);
      if (res.ok) return onDone();
      setError(res.error);
      for (const [path, message] of Object.entries(res.fieldErrors ?? {})) form.setError(path as "details", { message });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-white/20 p-4">
      <h3 className="font-medium">{def.label}</h3>
      <CategoryFields
        fields={def.fields}
        register={form.register as unknown as UseFormRegister<FieldValues>}
        errors={form.formState.errors}
        idPrefix={`m-${category}`}
      />
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RemoveButton({ category }: { category: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await removeMeasurementsAction(category)))}
    >
      Remove
    </Button>
  );
}
