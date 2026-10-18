"use client";

import { useId, useState } from "react";
import { useForm, useWatch, type FieldErrors, type FieldValues, type UseFormRegister } from "react-hook-form";
import {
  cancelOrderAction,
  editDetailsAction,
  loadDetailsContext,
  rejectOrderAction,
  requestInfoAction,
  updateNotesAction,
  updateTrackingAction,
} from "@/app/admin/_actions/orders";
import { CategoryFields } from "@/components/category/CategoryFields";
import { Field } from "@/components/admin/ui";
import { validateDetails } from "@/domain/categorySchema";
import { Sheet } from "../Sheet";
import { DrawerActions, ErrorNote, Loading, useAction, useLoaded, type DialogProps, type Result } from "./shared";

/** One text box and a button: needs info, reject, cancel. */
function TextDrawer({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  danger,
  initial = "",
  field,
  submit,
  onDone,
  multiline = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  submitLabel: string;
  danger?: boolean;
  initial?: string;
  field: string;
  submit: (value: string) => Promise<Result<unknown>>;
  onDone: (m: string) => void;
  multiline?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const { pending, error, fieldErrors, run } = useAction();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-5">
        <Field label={label} htmlFor={id} error={fieldErrors[field]}>
          {multiline ? (
            <textarea id={id} rows={5} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="admin-input" />
          ) : (
            <input id={id} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="admin-input" />
          )}
        </Field>
        <ErrorNote message={error} />
        <DrawerActions onCancel={() => onOpenChange(false)}>
          <button
            type="button"
            disabled={pending}
            className={danger ? "admin-btn-danger" : "admin-btn-primary"}
            onClick={() => run(() => submit(value), (_, m) => onDone(m ?? "Saved"))}
          >
            {pending ? "Saving…" : submitLabel}
          </button>
        </DrawerActions>
      </div>
    </Sheet>
  );
}

export function NeedsInfoDialog(p: DialogProps) {
  return (
    <TextDrawer
      {...p}
      title="Ask for more info"
      description={`Order #${p.orderId} pauses until the student replies.`}
      label="What do you need? (the student sees this)"
      placeholder="e.g. Which colour do you want? The listing has three."
      submitLabel="Send question"
      field="message"
      submit={(message) => requestInfoAction({ orderId: p.orderId, message })}
    />
  );
}

export function RejectDialog(p: DialogProps) {
  return (
    <TextDrawer
      {...p}
      title="Reject order"
      description="Any payment is reversed and comes up as a refund to issue."
      label="Reason (the student sees this)"
      submitLabel="Reject order"
      danger
      field="reason"
      submit={(reason) => rejectOrderAction({ orderId: p.orderId, reason })}
    />
  );
}

export function CancelDialog(p: DialogProps) {
  return (
    <TextDrawer
      {...p}
      title="Cancel order"
      description="Only possible before it's bought. A paid order comes up as a refund to issue."
      label="Reason"
      submitLabel="Cancel order"
      danger
      field="reason"
      submit={(reason) => cancelOrderAction({ orderId: p.orderId, reason })}
    />
  );
}

export function NotesDialog(p: DialogProps & { initial: string | null }) {
  return (
    <TextDrawer
      {...p}
      initial={p.initial ?? ""}
      title="Internal notes"
      description="Never shown to the student."
      label="Notes"
      submitLabel="Save notes"
      field="notes"
      submit={(notes) => updateNotesAction({ orderId: p.orderId, notes: notes || null })}
    />
  );
}

export function TrackingDialog({ orderId, open, onOpenChange, onDone, initial }: DialogProps & { initial: { trackingNumber: string | null; trackingNote: string | null } }) {
  const id = useId();
  const [num, setNum] = useState(initial.trackingNumber ?? "");
  const [note, setNote] = useState(initial.trackingNote ?? "");
  const { pending, error, run } = useAction();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Tracking" description={`Order #${orderId}`}>
      <div className="space-y-5">
        <Field label="Tracking number" htmlFor={`${id}-n`}>
          <input id={`${id}-n`} value={num} onChange={(e) => setNum(e.target.value)} className="admin-input font-mono" />
        </Field>
        <Field label="Tracking note (the student sees this)" htmlFor={`${id}-t`}>
          <textarea id={`${id}-t`} rows={4} value={note} onChange={(e) => setNote(e.target.value)} className="admin-input" />
        </Field>
        <ErrorNote message={error} />
        <DrawerActions onCancel={() => onOpenChange(false)}>
          <button
            type="button"
            disabled={pending}
            className="admin-btn-primary"
            onClick={() => run(() => updateTrackingAction({ orderId, trackingNumber: num || null, trackingNote: note || null }), (_, m) => onDone(m ?? "Saved"))}
          >
            {pending ? "Saving…" : "Save tracking"}
          </button>
        </DrawerActions>
      </div>
    </Sheet>
  );
}

/** Fix a typo in the category details; validated against the order's own category version. */
export function DetailsDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Edit category details" description={`Order #${orderId} · logged in the history`} size="lg">
      <DetailsBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function DetailsBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadDetailsContext({ orderId }));
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  return <DetailsForm ctx={ctx.data} onDone={onDone} onCancel={onCancel} />;
}

type DetailsCtx = Extract<Awaited<ReturnType<typeof loadDetailsContext>>, { ok: true }>["data"];

function DetailsForm({ ctx, onDone, onCancel }: { ctx: DetailsCtx; onDone: (m: string) => void; onCancel: () => void }) {
  const form = useForm<{ details: Record<string, unknown>; variantText: string }>({
    defaultValues: { details: ctx.order.details, variantText: ctx.order.variantText ?? "" },
  });
  const values = useWatch({ control: form.control, name: "details" });
  const { pending, error, fieldErrors, run } = useAction();
  const option = ctx.definition.option;

  const submit = form.handleSubmit((data) => {
    const local = validateDetails(ctx.fields, data.details);
    if (!local.ok) {
      for (const [k, m] of Object.entries(local.fieldErrors)) form.setError(`details.${k}`, { message: m });
      return;
    }
    run(() => editDetailsAction({ orderId: ctx.order.id, details: data.details, variantText: data.variantText || null }), (_, m) => onDone(m ?? "Saved"));
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-sm text-white/55">
        {ctx.category.name} · version {ctx.category.version}
      </p>
      <CategoryFields
        fields={ctx.fields}
        register={form.register as unknown as UseFormRegister<FieldValues>}
        errors={
          {
            ...form.formState.errors,
            // Server errors arrive as "details.<key>"; nest them where the fields look.
            details: {
              ...Object.fromEntries(
                Object.entries(fieldErrors).flatMap(([k, m]) => (k.startsWith("details.") ? [[k.slice(8), { type: "server", message: m }]] : [])),
              ),
              ...(form.formState.errors.details ?? {}),
            },
          } as FieldErrors
        }
        values={values ?? {}}
        idPrefix="edit"
      />
      <Field label={option ? option.label : "Option"} htmlFor="edit-variant" error={fieldErrors.variantText}>
        <input id="edit-variant" {...form.register("variantText")} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        <button type="submit" disabled={pending} className="admin-btn-primary">
          {pending ? "Saving…" : "Save details"}
        </button>
      </DrawerActions>
    </form>
  );
}
