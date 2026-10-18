"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Send, Star, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { deleteOptionAction, loadOptionsContext, reorderOptionsAction, saveOptionAction, sendOptionsAction } from "@/app/admin/_actions/orders";
import { Field } from "@/components/admin/ui";
import { formatCny } from "@/domain/money";
import { cn } from "@/lib/utils";
import { ImagesInput, type UploadedImage } from "../ImagesInput";
import { Sheet } from "../Sheet";
import {
  DrawerActions,
  ErrorNote,
  Loading,
  MoneyInput,
  minorToInput,
  parseMinor,
  parseScaled,
  scaledToInput,
  useAction,
  useLoaded,
  type DialogProps,
} from "./shared";

const MAX = 3;
type Ctx = Extract<Awaited<ReturnType<typeof loadOptionsContext>>, { ok: true }>["data"];
type Option = Ctx["options"][number];

/** 2–3 sourcing options for a photo search or consultation, then sent to the student to pick from. */
export function OptionsDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Sourcing options" description={`Order #${orderId} · 2–3 options is ideal`} size="lg">
      <OptionsBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function OptionsBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadOptionsContext({ orderId }));
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const { pending, error, run } = useAction();

  if (ctx.loading && !ctx.data) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  const { order, options } = ctx.data;
  const sent = Boolean(order.optionsSentAt);

  const move = (i: number, dir: -1 | 1) => {
    const ids = options.map((o) => o.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => reorderOptionsAction({ orderId, ids }), () => ctx.reload());
  };

  return (
    <div className="space-y-4">
      <div className="text-sm">
        <p className="font-medium">{order.itemName}</p>
        {order.remarks ? <p className="mt-1 whitespace-pre-line text-white/60">“{order.remarks}”</p> : null}
        {sent ? <p className="mt-2 text-sky-300">Options were sent; changing them and sending again asks the student to choose again.</p> : null}
        {order.feeUnpaid ? <p className="mt-2 text-warning">Mark the upfront fee paid before adding options.</p> : null}
      </div>

      <ol className="space-y-3">
        {options.map((o, i) =>
          editing === o.id ? (
            <li key={o.id}>
              <OptionForm orderId={orderId} option={o} onSaved={() => (setEditing(null), ctx.reload())} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={o.id} className={cn("admin-card flex gap-3 p-3", o.isSelected && "border-sky-400/50")}>
              {o.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
                <img src={o.photoUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="size-16 shrink-0 rounded-lg bg-white/5" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {o.title}
                  {o.isRecommended ? (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <Star className="size-3 fill-current" aria-hidden />
                      Recommended
                    </span>
                  ) : null}
                  {o.isSelected ? <span className="text-xs text-sky-300">Student&apos;s pick</span> : null}
                </p>
                <p className="tabular-nums">{formatCny(o.priceFen)}</p>
                <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-sky-300 underline underline-offset-2">
                  {o.url}
                </a>
                {o.sellerNote ? <p className="mt-1 text-xs text-white/55">{o.sellerNote}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <IconBtn label="Move up" disabled={i === 0 || pending} onClick={() => move(i, -1)} icon={ArrowUp} />
                <IconBtn label="Move down" disabled={i === options.length - 1 || pending} onClick={() => move(i, 1)} icon={ArrowDown} />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <IconBtn label="Edit" onClick={() => setEditing(o.id)} icon={Pencil} />
                <IconBtn
                  label="Delete"
                  disabled={pending}
                  onClick={() => run(() => deleteOptionAction({ orderId, optionId: o.id }), () => ctx.reload())}
                  icon={Trash2}
                />
              </div>
            </li>
          ),
        )}
      </ol>

      {editing === "new" ? (
        <OptionForm orderId={orderId} option={null} onSaved={() => (setEditing(null), ctx.reload())} onCancel={() => setEditing(null)} />
      ) : options.length < MAX && !order.feeUnpaid ? (
        <button type="button" onClick={() => setEditing("new")} className="admin-btn-secondary w-full border-dashed">
          <Plus className="size-4" aria-hidden />
          Add option {options.length + 1} of {MAX}
        </button>
      ) : null}

      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel} cancelLabel="Close">
        <button
          type="button"
          disabled={pending || options.length === 0 || editing !== null}
          onClick={() => run(() => sendOptionsAction({ orderId }), (_, m) => onDone(m ?? "Options sent"))}
          className="admin-btn-primary"
        >
          <Send className="size-4" aria-hidden />
          {sent ? "Send again" : `Send ${options.length || ""} option${options.length === 1 ? "" : "s"} to student`}
        </button>
      </DrawerActions>
    </div>
  );
}

function IconBtn({ label, onClick, icon: Icon, disabled }: { label: string; onClick: () => void; icon: typeof Pencil; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

function OptionForm({ orderId, option, onSaved, onCancel }: { orderId: number; option: Option | null; onSaved: () => void; onCancel: () => void }) {
  const id = useId();
  const [title, setTitle] = useState(option?.title ?? "");
  const [url, setUrl] = useState(option?.url ?? "");
  const [price, setPrice] = useState(minorToInput(option?.priceFen));
  const [note, setNote] = useState(option?.sellerNote ?? "");
  const [weight, setWeight] = useState(scaledToInput(option?.estWeightG, 1000));
  const [length, setLength] = useState(scaledToInput(option?.estLengthMm, 10));
  const [width, setWidth] = useState(scaledToInput(option?.estWidthMm, 10));
  const [height, setHeight] = useState(scaledToInput(option?.estHeightMm, 10));
  const [recommended, setRecommended] = useState(option?.isRecommended ?? false);
  const [photo, setPhoto] = useState<UploadedImage[]>(option?.photoKey && option.photoUrl ? [{ key: option.photoKey, url: option.photoUrl }] : []);
  const { pending, error, fieldErrors, run } = useAction();

  const num = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);
  function save() {
    run(
      () =>
        saveOptionAction({
          orderId,
          id: option?.id ?? null,
          title,
          url,
          priceFen: parseMinor(price) ?? 0,
          sellerNote: note || null,
          photoKey: photo[0]?.key ?? null,
          estWeightG: num(parseScaled(weight, 1000)),
          estLengthMm: num(parseScaled(length, 10)),
          estWidthMm: num(parseScaled(width, 10)),
          estHeightMm: num(parseScaled(height, 10)),
          isRecommended: recommended,
        }),
      onSaved,
    );
  }

  return (
    <div className="admin-card space-y-4 border-white/25 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor={`${id}-t`} error={fieldErrors.title} className="sm:col-span-2">
          <input id={`${id}-t`} value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input" placeholder="e.g. Same dress, navy, seller with 98% rating" />
        </Field>
        <Field label="Listing link" htmlFor={`${id}-u`} error={fieldErrors.url} className="sm:col-span-2">
          <input id={`${id}-u`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="admin-input" />
        </Field>
        <Field label="Price each" htmlFor={`${id}-p`} error={fieldErrors.priceFen}>
          <MoneyInput id={`${id}-p`} currency="¥" value={price} onChange={setPrice} invalid={!!fieldErrors.priceFen} />
        </Field>
        <Field label="Photo" htmlFor={`${id}-ph`}>
          <ImagesInput value={photo} onChange={setPhoto} purpose="sourcing" max={1} />
        </Field>
        <Field label="Seller note — optional" htmlFor={`${id}-n`} className="sm:col-span-2">
          <textarea id={`${id}-n`} value={note} onChange={(e) => setNote(e.target.value)} className="admin-input" rows={2} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-white/85">Estimated size per item — optional</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Weight (kg)", weight, setWeight],
              ["Length (cm)", length, setLength],
              ["Width (cm)", width, setWidth],
              ["Height (cm)", height, setHeight],
            ] as const
          ).map(([label, v, set]) => (
            <Field key={label} label={label} htmlFor={`${id}-${label}`}>
              <input id={`${id}-${label}`} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className="admin-input" />
            </Field>
          ))}
        </div>
      </fieldset>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={recommended} onChange={(e) => setRecommended(e.target.checked)} className="size-5 accent-sky-500" />
        Mark as recommended
      </label>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="admin-btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary flex-1">
          {pending ? "Saving…" : "Save option"}
        </button>
      </div>
    </div>
  );
}
