"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { useForm, useWatch, type FieldErrors, type FieldValues, type UseFormRegister } from "react-hook-form";
import { anonymiseCustomerAction, customerMeasurementsAction, customerNotesAction } from "@/app/admin/_actions/customers";
import { CategoryFields } from "@/components/category/CategoryFields";
import { ErrorNote, useAction } from "@/components/admin/dialogs/shared";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Field } from "@/components/admin/ui";
import { libraryFields, MEASUREMENT_GROUP_LABELS, type MeasurementDef, type SavedMeasurements } from "@/domain/categorySchema";

function useDone() {
  const router = useRouter();
  const toast = useToast();
  return (m?: string) => {
    toast(m ?? "Saved");
    router.refresh();
  };
}

export function NotesEditor({ id, initial }: { id: string; initial: string | null }) {
  const fid = useId();
  const [notes, setNotes] = useState(initial ?? "");
  const done = useDone();
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-2">
      <label htmlFor={fid} className="sr-only">
        Internal notes
      </label>
      <textarea id={fid} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only admins see this." className="admin-input" />
      <ErrorNote message={error} />
      <button type="button" disabled={pending || notes === (initial ?? "")} onClick={() => run(() => customerNotesAction({ id, notes: notes || null }), (_, m) => done(m))} className="admin-btn-secondary">
        Save notes
      </button>
    </div>
  );
}

export function MeasurementsButton({ id, saved, library }: { id: string; saved: SavedMeasurements; library: MeasurementDef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-sm text-sky-300 hover:underline" onClick={() => setOpen(true)}>
        Edit
      </button>
      {open ? <MeasurementsSheet id={id} saved={saved} library={library} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MeasurementsSheet({ id, saved, library, onClose }: { id: string; saved: SavedMeasurements; library: MeasurementDef[]; onClose: () => void }) {
  const fields = useMemo(() => libraryFields(library), [library]);
  const form = useForm<{ details: Record<string, unknown> }>({ defaultValues: { details: saved } });
  const values = useWatch({ control: form.control, name: "details" });
  const done = useDone();
  const { pending, error, fieldErrors, run } = useAction();
  const groups = Object.values(MEASUREMENT_GROUP_LABELS);
  const serverErrors = { details: Object.fromEntries(Object.entries(fieldErrors).flatMap(([k, m]) => (k.startsWith("details.") ? [[k.slice(8), { type: "server", message: m }]] : []))) } as FieldErrors;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Saved measurements" description="Logged in the change log. Leave a box empty to remove it." size="lg">
      <form
        noValidate
        onSubmit={form.handleSubmit((data) => run(() => customerMeasurementsAction({ id, details: data.details }), (_, m) => (onClose(), done(m))))}
        className="space-y-5"
      >
        {groups.map((label, g) => {
          const inGroup = fields.filter((f) => f.section === g);
          if (!inGroup.length) return null;
          return (
            <fieldset key={label} className="space-y-3 rounded-2xl border border-white/10 p-4">
              <legend className="px-1 text-sm font-medium">{label}</legend>
              <CategoryFields fields={inGroup} register={form.register as unknown as UseFormRegister<FieldValues>} errors={serverErrors} values={values ?? {}} idPrefix="cm" />
            </fieldset>
          );
        })}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="admin-btn-primary" disabled={pending}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** PDPA delete, behind a typed confirmation. */
export function AnonymiseButton({ id, name }: { id: string; name: string }) {
  const fid = useId();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const done = useDone();
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="admin-btn-danger" onClick={() => setOpen(true)}>
        Delete personal data…
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={`Delete ${name}'s personal data`} description="This can't be undone.">
        <div className="space-y-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-white/75">
            <li>Name, email, phone, campus and saved measurements are removed.</li>
            <li>Order details, remarks and reference photos are removed.</li>
            <li>They can no longer sign in.</li>
            <li>Orders and the ledger stay (with no name attached) for the accounts.</li>
          </ul>
          <Field label="Type DELETE to confirm" htmlFor={fid}>
            <input id={fid} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="admin-input font-mono" autoComplete="off" />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="admin-btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="admin-btn-danger" disabled={pending || confirm !== "DELETE"} onClick={() => run(() => anonymiseCustomerAction({ id, confirm }), (_, m) => (setOpen(false), done(m)))}>
              Delete personal data
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
