"use client";

import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { useMemo, useState } from "react";
import { useForm, useWatch, type FieldValues, type UseFormRegister } from "react-hook-form";
import {
  deleteCategoryAction,
  discardDraftAction,
  draftDiffAction,
  publishDraftAction,
  saveDraftAction,
  updateCategoryAction,
} from "@/app/admin/_actions/settings";
import { CategoryFields } from "@/components/category/CategoryFields";
import { CategoryIcon } from "@/components/admin/CategoryIcon";
import { ErrorNote, Loading, useAction, useLoaded } from "@/components/admin/dialogs/shared";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Badge, Field } from "@/components/admin/ui";
import { definitionSchema, FIELD_KINDS, keyOf, type CategoryDefinition, type DefinitionDiff, type FieldDef, type FieldKind } from "@/domain/categoryDefinition";
import { fieldName, resolveFields, validateDetails, validateOption, type MeasurementDef } from "@/domain/categorySchema";
import type { getCategoryAdmin } from "@/server/admin/categories";
import { cn } from "@/lib/utils";
import { CategoryInfoForm, type CategoryInfoValues } from "./CategoryInfoForm";
import { FieldSheet, KIND_LABELS, labelOf, newField } from "./FieldSheet";

type Data = NonNullable<Awaited<ReturnType<typeof getCategoryAdmin>>>;

const EMPTY: CategoryDefinition = { sections: [{ title: "", fields: [] }] };

export function CategoryEditor({ data, imageUrls: initialUrls }: { data: Data; imageUrls: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const c = data.category;
  const [info, setInfo] = useState<CategoryInfoValues>({
    key: c.key,
    name: c.name,
    icon: c.icon,
    fulfilment: c.fulfilment,
    defaultWeightG: c.defaultParcel.weightG,
    defaultLengthMm: c.defaultParcel.lengthMm,
    defaultWidthMm: c.defaultParcel.widthMm,
    defaultHeightMm: c.defaultParcel.heightMm,
    allowedShippingModes: c.allowedShippingModes,
    restrictedNote: c.restrictedNote,
    isActive: c.isActive,
  });
  const [def, setDef] = useState<CategoryDefinition>(data.draft?.definition ?? data.published?.definition ?? EMPTY);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{ s: number; f: number | null; field: FieldDef } | null>(null);
  const [imageUrls, setImageUrls] = useState(initialUrls);
  const [publishing, setPublishing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoAction = useAction();
  const draftAction = useAction();
  const lockedKeys = useMemo(() => new Set(data.lockedKeys), [data.lockedKeys]);

  const change = (next: CategoryDefinition) => {
    setDef(next);
    setDirty(true);
  };
  const flat = def.sections.flatMap((s) => s.fields);
  const takenKeys = new Set(flat.map(keyOf));
  const check = definitionSchema.safeParse(def);
  const issues = check.success ? [] : check.error.issues.slice(0, 5).map((i) => i.message);
  const library = data.library;

  const updateSection = (s: number, fn: (fields: FieldDef[]) => FieldDef[]) =>
    change({ ...def, sections: def.sections.map((sec, i) => (i === s ? { ...sec, fields: fn(sec.fields) } : sec)) });

  const moveField = (s: number, f: number, dir: -1 | 1) => {
    const sec = def.sections[s];
    if (f + dir >= 0 && f + dir < sec.fields.length) {
      updateSection(s, (fields) => {
        const next = [...fields];
        [next[f], next[f + dir]] = [next[f + dir], next[f]];
        return next;
      });
    } else if (s + dir >= 0 && s + dir < def.sections.length) {
      // Past the end of a section: move into the neighbouring one.
      const field = sec.fields[f];
      const sections = def.sections.map((x) => ({ ...x, fields: [...x.fields] }));
      sections[s].fields.splice(f, 1);
      if (dir === 1) sections[s + 1].fields.unshift(field);
      else sections[s - 1].fields.push(field);
      change({ ...def, sections });
    }
  };

  const [drag, setDrag] = useState<{ s: number; f: number } | null>(null);
  const dropOn = (s: number, f: number) => {
    if (!drag) return;
    const sections = def.sections.map((x) => ({ ...x, fields: [...x.fields] }));
    const [field] = sections[drag.s].fields.splice(drag.f, 1);
    sections[s].fields.splice(f, 0, field);
    setDrag(null);
    change({ ...def, sections });
  };

  function saveDraft(then?: () => void) {
    draftAction.run(
      () => saveDraftAction({ categoryId: c.id, definition: def }),
      (_, m) => {
        setDirty(false);
        toast(m ?? "Draft saved");
        router.refresh();
        then?.();
      },
    );
  }

  const status = data.draft ? `Draft v${data.draft.version}` : data.published ? `Published v${data.published.version}` : "New";

  return (
    <div className="mt-2 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
            <CategoryIcon name={info.icon} className="size-6" />
          </span>
          <div>
            <h2 className="display text-4xl">{info.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55">
              <span className="font-mono text-xs">{c.key}</span>
              <Badge tone={data.draft ? "info" : "success"}>{status}</Badge>
              {data.published && data.draft ? <Badge>live: v{data.published.version}</Badge> : null}
              {!info.isActive ? <Badge tone="warning">off</Badge> : null}
              <span>
                {data.orderCount} order{data.orderCount === 1 ? "" : "s"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-btn-secondary" onClick={() => setInfoOpen(true)}>
            Basic info
          </button>
          <button type="button" className="admin-btn-secondary" disabled={draftAction.pending || !check.success} onClick={() => saveDraft()}>
            {dirty ? "Save draft" : "Draft saved"}
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={draftAction.pending || !check.success || (!dirty && !data.draft)}
            onClick={() => (dirty ? saveDraft(() => setPublishing(true)) : setPublishing(true))}
          >
            Publish…
          </button>
        </div>
      </header>
      <ErrorNote message={draftAction.error} />
      {issues.length ? (
        <ul className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {issues.map((i, n) => (
            <li key={n}>{i}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <div className="space-y-4">
          {def.sections.map((sec, s) => (
            <section key={s} className="admin-card p-4" onDragOver={(e) => e.preventDefault()} onDrop={() => drag && sec.fields.length === 0 && dropOn(s, 0)}>
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Section ${s + 1} title`}
                  value={sec.title}
                  placeholder={`Section ${s + 1} title (optional)`}
                  onChange={(e) => change({ ...def, sections: def.sections.map((x, i) => (i === s ? { ...x, title: e.target.value } : x)) })}
                  className="admin-input flex-1"
                />
                {def.sections.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Remove section"
                    onClick={() => {
                      if (sec.fields.length && !confirm(`Remove this section and its ${sec.fields.length} field(s)?`)) return;
                      change({ ...def, sections: def.sections.filter((_, i) => i !== s) });
                    }}
                    className="grid size-10 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <ol className="mt-3 space-y-2">
                {sec.fields.map((field, f) => (
                  <li
                    key={`${keyOf(field)}-${f}`}
                    draggable
                    onDragStart={() => setDrag({ s, f })}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.stopPropagation();
                      dropOn(s, f);
                    }}
                    className={cn("flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2", drag?.s === s && drag.f === f && "opacity-40")}
                  >
                    <GripVertical className="hidden size-4 shrink-0 cursor-grab text-white/30 sm:block" aria-hidden />
                    <div className="min-w-0 flex-1 px-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {labelOf(field, library)}
                        {field.required ? <Badge tone="info">required</Badge> : null}
                        {field.requiredIf ? <Badge>required if</Badge> : null}
                        {field.showIf ? <Badge>conditional</Badge> : null}
                        {lockedKeys.has(keyOf(field)) ? null : <Badge tone="success">new</Badge>}
                      </p>
                      <p className="text-xs text-white/45">
                        {KIND_LABELS[field.kind]} · <span className="font-mono">{keyOf(field)}</span>
                      </p>
                    </div>
                    <button type="button" aria-label="Move up" onClick={() => moveField(s, f, -1)} disabled={s === 0 && f === 0} className="grid size-9 place-items-center rounded-lg text-white/50 hover:text-white disabled:opacity-20">
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => moveField(s, f, 1)}
                      disabled={s === def.sections.length - 1 && f === sec.fields.length - 1}
                      className="grid size-9 place-items-center rounded-lg text-white/50 hover:text-white disabled:opacity-20"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button type="button" aria-label={`Edit ${labelOf(field, library)}`} onClick={() => setEditing({ s, f, field })} className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${labelOf(field, library)}`}
                      title={lockedKeys.has(keyOf(field)) ? "Removing a published field hides it from new orders; old orders keep it." : "Remove"}
                      onClick={() => updateSection(s, (fields) => fields.filter((_, i) => i !== f))}
                      className="grid size-9 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
              <AddFieldMenu onAdd={(kind) => setEditing({ s, f: null, field: newField(kind, library, takenKeys) })} />
            </section>
          ))}
          <button type="button" className="admin-btn-secondary w-full border-dashed" onClick={() => change({ ...def, sections: [...def.sections, { title: "", fields: [] }] })}>
            <Plus className="size-4" aria-hidden />
            Add section
          </button>

          <OptionLine def={def} onChange={change} />
        </div>

        <Preview def={def} library={library} imageUrls={imageUrls} />
      </div>

      {editing ? (
        <FieldSheet
          field={editing.field}
          earlier={[...def.sections.slice(0, editing.s).flatMap((x) => x.fields), ...def.sections[editing.s].fields.slice(0, editing.f ?? def.sections[editing.s].fields.length)]}
          library={library}
          lockedKeys={lockedKeys}
          takenKeys={takenKeys}
          imageUrls={imageUrls}
          onClose={() => setEditing(null)}
          onSave={(field, image) => {
            if (image) setImageUrls((u) => ({ ...u, [image.key]: image.url }));
            updateSection(editing.s, (fields) => (editing.f === null ? [...fields, field] : fields.map((x, i) => (i === editing.f ? field : x))));
            setEditing(null);
          }}
        />
      ) : null}

      {infoOpen ? (
        <Sheet open onOpenChange={setInfoOpen} title="Basic info" size="lg">
          <CategoryInfoForm value={info} onChange={setInfo} isNew={false} fieldErrors={infoAction.fieldErrors} />
          <ErrorNote message={infoAction.error} className="mt-4" />
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {data.orderCount === 0 && !data.published ? (
              <button
                type="button"
                className="admin-btn-danger"
                onClick={() =>
                  confirm("Delete this category?") &&
                  infoAction.run(
                    () => deleteCategoryAction({ id: c.id }),
                    () => {
                      toast("Category deleted");
                      router.push("/admin/settings/categories");
                    },
                  )
                }
              >
                Delete category
              </button>
            ) : (
              <span className="text-xs text-white/45">Used or published categories can&apos;t be deleted — switch them off instead.</span>
            )}
            <div className="flex gap-2">
              <button type="button" className="admin-btn-secondary" onClick={() => setInfoOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                disabled={infoAction.pending}
                onClick={() =>
                  infoAction.run(
                    () => updateCategoryAction({ id: c.id, ...info }),
                    (_, m) => {
                      toast(m ?? "Saved");
                      setInfoOpen(false);
                      router.refresh();
                    },
                  )
                }
              >
                Save info
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}

      {publishing ? (
        <PublishSheet
          categoryId={c.id}
          hasPublished={!!data.published}
          onClose={() => setPublishing(false)}
          onDiscarded={() => {
            setDef(data.published?.definition ?? EMPTY);
            setDirty(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AddFieldMenu({ onAdd }: { onAdd: (kind: FieldKind) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-sm text-white/70 hover:border-white/40 hover:text-white">
        <Plus className="size-4" aria-hidden />
        Add field
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={6} className="z-50 min-w-64 rounded-2xl border border-white/12 bg-neutral-950/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl">
          {FIELD_KINDS.map((k) => (
            <DropdownMenu.Item key={k} onSelect={() => onAdd(k)} className="flex h-10 cursor-pointer items-center rounded-xl px-3 text-sm text-white/85 outline-none data-highlighted:bg-white/10">
              {KIND_LABELS[k]}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The order's free-text "option" line (colour, size, shade): its label and whether it's required. */
function OptionLine({ def, onChange }: { def: CategoryDefinition; onChange: (d: CategoryDefinition) => void }) {
  const option = def.option;
  return (
    <section className="admin-card space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Option line</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!option}
            onChange={(e) => onChange({ ...def, option: e.target.checked ? { label: "Colour", required: true } : undefined })}
            className="size-5 accent-sky-500"
          />
          Custom label
        </label>
      </div>
      {option ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Label" htmlFor="opt-label">
            <input id="opt-label" value={option.label} onChange={(e) => onChange({ ...def, option: { ...option, label: e.target.value } })} className="admin-input" />
          </Field>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={option.required} onChange={(e) => onChange({ ...def, option: { ...option, required: e.target.checked } })} className="size-5 accent-sky-500" />
            Required
          </label>
        </div>
      ) : (
        <p className="text-sm text-white/50">Students see “Option — colour, size, version (optional)”.</p>
      )}
    </section>
  );
}

/** The form exactly as students will see it, with the same validation. */
function Preview({ def, library, imageUrls }: { def: CategoryDefinition; library: MeasurementDef[]; imageUrls: Record<string, string> }) {
  const form = useForm<{ details: Record<string, unknown>; variantText: string }>({ defaultValues: { details: {}, variantText: "" } });
  const values = useWatch({ control: form.control, name: "details" });
  const [result, setResult] = useState<string | null>(null);
  let fields: ReturnType<typeof resolveFields> = [];
  let problem: string | null = null;
  try {
    fields = resolveFields(def, library);
  } catch (e) {
    problem = (e as Error).message;
  }

  const check = form.handleSubmit((data) => {
    form.clearErrors();
    const r = validateDetails(fields, data.details);
    const optionError = validateOption(def, data.variantText);
    if (optionError) form.setError("variantText", { message: optionError });
    if (!r.ok) for (const [k, m] of Object.entries(r.fieldErrors)) form.setError(`details.${k}`, { message: m });
    setResult(r.ok && !optionError ? `Valid: ${JSON.stringify(r.value)}` : null);
  });

  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <form onSubmit={check} noValidate className="admin-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Student preview</h3>
          <span className="text-xs text-white/45">{fields.length} field{fields.length === 1 ? "" : "s"}</span>
        </div>
        {problem ? <p className="text-sm text-warning">{problem}</p> : null}
        <CategoryFields
          fields={fields}
          register={form.register as unknown as UseFormRegister<FieldValues>}
          errors={form.formState.errors}
          values={values ?? {}}
          helpImageUrls={imageUrls}
          idPrefix="preview"
        />
        <Field
          label={def.option ? `${def.option.label}${def.option.required ? "" : " — optional"}` : "Option — colour, size, version (optional)"}
          htmlFor="preview-variant"
          error={form.formState.errors.variantText?.message}
        >
          <input id="preview-variant" {...form.register("variantText")} className="admin-input" />
        </Field>
        <button type="submit" className="admin-btn-secondary w-full">
          Check like on submit
        </button>
        {result ? <p className="text-xs break-all text-success">{result}</p> : null}
        <p className="text-xs text-white/40">{fields.map((f) => fieldName(f)).join(" · ")}</p>
      </form>
    </aside>
  );
}

function PublishSheet({
  categoryId,
  hasPublished,
  onClose,
  onDiscarded,
}: {
  categoryId: string;
  hasPublished: boolean;
  onClose: () => void;
  onDiscarded: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const load = useLoaded(() => draftDiffAction({ categoryId }));
  const act = useAction();
  const diff: { diff: DefinitionDiff; from: number | null; to: number } | null = load.data;
  const d = diff?.diff;
  const nothing = d && !d.added.length && !d.removed.length && !d.changed.length && !d.optionChanged;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={diff ? `Publish version ${diff.to}` : "Publish"} description={diff?.from ? `Replaces version ${diff.from}. Existing orders keep the version they were made with.` : "First version: the category goes live on the order form."}>
      {d ? (
        <div className="space-y-4 text-sm">
          {nothing ? <p className="text-white/60">No field changes compared to the live version.</p> : null}
          {d.added.length ? <DiffList title="Added" tone="success" items={d.added} /> : null}
          {d.removed.length ? <DiffList title={hasPublished ? "Removed (hidden from new orders)" : "Removed"} tone="danger" items={d.removed} /> : null}
          {d.changed.length ? <DiffList title="Changed" tone="info" items={d.changed.map((c) => `${c.key}: ${c.what.join(", ")}`)} /> : null}
          {d.optionChanged ? <DiffList title="Option line" tone="info" items={["label or requirement changed"]} /> : null}
          <ErrorNote message={act.error} />
          <div className="flex justify-end gap-2">
            {hasPublished ? (
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() =>
                  confirm("Throw away the draft and go back to the live version?") &&
                  act.run(
                    () => discardDraftAction({ categoryId }),
                    (_, m) => {
                      toast(m ?? "Draft discarded");
                      onDiscarded();
                      onClose();
                      router.refresh();
                    },
                  )
                }
              >
                Discard draft
              </button>
            ) : null}
            <button
              type="button"
              className="admin-btn-primary"
              disabled={act.pending}
              onClick={() =>
                act.run(
                  () => publishDraftAction({ categoryId }),
                  (_, m) => {
                    toast(m ?? "Published");
                    onClose();
                    router.refresh();
                  },
                )
              }
            >
              Publish now
            </button>
          </div>
        </div>
      ) : load.loading ? (
        <Loading />
      ) : (
        <ErrorNote message={load.error} />
      )}
    </Sheet>
  );
}

function DiffList({ title, tone, items }: { title: string; tone: "success" | "danger" | "info"; items: string[] }) {
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li key={i}>
            <Badge tone={tone}>{i}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
