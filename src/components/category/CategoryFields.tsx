"use client";

import { get, type FieldErrors, type FieldValues, type UseFormRegister } from "react-hook-form";
import { FieldError } from "@/components/form/FieldError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FieldMeta } from "@/domain/categories";
import { cn } from "@/lib/utils";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

/**
 * Renders any category's fields from registry metadata. The same registry
 * builds the Zod schema that validates these fields in the browser and again
 * on the server.
 */
export function CategoryFields({
  fields,
  register,
  errors,
  prefix = "details",
  idPrefix = "cf",
}: {
  fields: readonly FieldMeta[];
  register: UseFormRegister<FieldValues>;
  errors: FieldErrors;
  prefix?: string;
  idPrefix?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const name = `${prefix}.${f.key}`;
        const id = `${idPrefix}-${f.key}`;
        const message = get(errors, name)?.message as string | undefined;
        const describedBy = [f.help ? `${id}-help` : null, message ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
        const common = {
          id,
          "aria-invalid": message ? true : undefined,
          "aria-describedby": describedBy,
          ...register(name),
        };
        const label = f.input === "number" && f.unit ? `${f.label} (${f.unit})` : f.label;

        return (
          <div key={f.key} className={cn("space-y-1.5", f.input === "textarea" && "sm:col-span-2")}>
            <Label htmlFor={id}>
              {label}
              {f.optional ? <span className="font-normal text-muted-foreground"> — optional</span> : null}
            </Label>
            {f.input === "number" ? (
              <Input
                type="number"
                inputMode="decimal"
                step={f.step}
                min={f.min}
                max={f.max}
                placeholder={f.placeholder}
                className="h-11"
                {...common}
              />
            ) : f.input === "select" ? (
              <select className={selectClass} defaultValue="" {...common}>
                <option value="" disabled>
                  Choose…
                </option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.input === "textarea" ? (
              <Textarea rows={4} maxLength={f.maxLength} placeholder={f.placeholder} {...common} />
            ) : (
              <Input
                type={f.input === "email" ? "email" : "text"}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                className="h-11"
                {...common}
              />
            )}
            {f.help ? (
              <p id={`${id}-help`} className="text-xs text-muted-foreground">
                {f.help}
              </p>
            ) : null}
            <FieldError id={`${id}-err`} message={message} />
          </div>
        );
      })}
    </div>
  );
}
