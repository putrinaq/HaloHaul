"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { deleteMeasurementAction, saveMeasurementAction } from "@/app/admin/_actions/settings";
import { ErrorNote, useAction } from "@/components/admin/dialogs/shared";
import { ImagesInput, type UploadedImage } from "@/components/admin/ImagesInput";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Badge, Field } from "@/components/admin/ui";
import { MEASUREMENT_GROUP_LABELS, type MeasurementDef } from "@/domain/categorySchema";
import { MEASUREMENT_GROUPS, MEASUREMENT_UNITS, type MeasurementGroup } from "@/domain/enums";

type Row = MeasurementDef & { usedBy: string[]; imageUrl: string | null };

/** The shared measurement library: one saved value per student works in every category that asks for it. */
export function MeasurementLibrary({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-white/55">
          Categories pick from this list, so a student&apos;s saved chest measurement fills in every form that asks for it. Changing a range affects every category using it.
        </p>
        <button type="button" className="admin-btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add measurement
        </button>
      </div>
      {MEASUREMENT_GROUPS.map((g) => {
        const inGroup = rows.filter((r) => r.group === g);
        if (inGroup.length === 0) return null;
        return (
          <section key={g}>
            <h2 className="mb-2 text-sm font-medium text-white/60">{MEASUREMENT_GROUP_LABELS[g]}</h2>
            <ul className="admin-card divide-y divide-white/10 text-sm">
              {inGroup.map((m) => (
                <li key={m.key}>
                  <button type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-white/5">
                    {m.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
                      <img src={m.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                    ) : (
                      <span className="size-10 rounded-lg bg-white/5" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {m.label}
                        {!m.isActive ? <Badge tone="warning">off</Badge> : null}
                      </span>
                      <span className="block font-mono text-xs text-white/45">{m.key}</span>
                    </span>
                    <span className="hidden text-white/60 tabular-nums sm:block">
                      {m.min}–{m.max} {m.unit} · step {m.step}
                    </span>
                    <span className="w-40 truncate text-right text-xs text-white/45">{m.usedBy.length ? m.usedBy.join(", ") : "Not used"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {editing ? <MeasurementSheet row={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function MeasurementSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({
    key: row?.key ?? "",
    label: row?.label ?? "",
    unit: row?.unit ?? "cm",
    min: String(row?.min ?? ""),
    max: String(row?.max ?? ""),
    step: String(row?.step ?? "0.5"),
    helpText: row?.helpText ?? "",
    group: row?.group ?? ("upper_body" as MeasurementGroup),
    sortOrder: String(row?.sortOrder ?? 100),
    isActive: row?.isActive ?? true,
  });
  const [image, setImage] = useState<UploadedImage[]>(row?.helpImageKey && row.imageUrl ? [{ key: row.helpImageKey, url: row.imageUrl }] : []);
  const { pending, error, fieldErrors, run } = useAction();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const finish = (m?: string) => {
    toast(m ?? "Saved");
    onClose();
    router.refresh();
  };
  const labels = { min: "Minimum", max: "Maximum", step: "Step", sortOrder: "Sort order" } as const;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? row.label : "Add measurement"}
      description={row ? "The key can't change once created." : "Lowercase key with the unit at the end, e.g. neck_cm."}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key" htmlFor={`${id}-k`} error={fieldErrors.key}>
            <input id={`${id}-k`} value={v.key} disabled={!!row} onChange={(e) => set("key", e.target.value)} className="admin-input font-mono" />
          </Field>
          <Field label="Label" htmlFor={`${id}-l`} error={fieldErrors.label}>
            <input id={`${id}-l`} value={v.label} onChange={(e) => set("label", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Unit" htmlFor={`${id}-u`}>
            <select id={`${id}-u`} value={v.unit} onChange={(e) => set("unit", e.target.value as typeof v.unit)} className="admin-input">
              {MEASUREMENT_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Group" htmlFor={`${id}-g`}>
            <select id={`${id}-g`} value={v.group} onChange={(e) => set("group", e.target.value as MeasurementGroup)} className="admin-input">
              {MEASUREMENT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {MEASUREMENT_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>
          {(["min", "max", "step", "sortOrder"] as const).map((k) => (
            <Field key={k} label={labels[k]} htmlFor={`${id}-${k}`} error={fieldErrors[k]}>
              <input id={`${id}-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => set(k, e.target.value)} className="admin-input tabular-nums" />
            </Field>
          ))}
        </div>
        <Field label="How to measure" htmlFor={`${id}-h`}>
          <textarea id={`${id}-h`} rows={3} value={v.helpText} onChange={(e) => set("helpText", e.target.value)} className="admin-input" />
        </Field>
        <Field label="Picture — optional" htmlFor={`${id}-img`}>
          <ImagesInput value={image} onChange={setImage} purpose="help" max={1} />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} className="size-5 accent-sky-500" />
          Offered to categories and on the account page
        </label>
        {row?.usedBy.length ? <p className="text-xs text-white/50">Used by {row.usedBy.join(", ")}.</p> : null}
        <ErrorNote message={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {row && row.usedBy.length === 0 ? (
            <button type="button" className="admin-btn-danger" disabled={pending} onClick={() => run(() => deleteMeasurementAction({ key: row.key }), (_, m) => finish(m))}>
              Delete
            </button>
          ) : null}
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  saveMeasurementAction({
                    key: v.key.trim(),
                    isNew: !row,
                    label: v.label,
                    unit: v.unit,
                    min: Number(v.min),
                    max: Number(v.max),
                    step: Number(v.step),
                    helpText: v.helpText || null,
                    helpImageKey: image[0]?.key ?? null,
                    group: v.group,
                    sortOrder: Number(v.sortOrder) || 0,
                    isActive: v.isActive,
                  }),
                (_, m) => finish(m),
              )
            }
          >
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}
