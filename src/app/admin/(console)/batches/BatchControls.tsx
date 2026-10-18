"use client";

import { Check, ClipboardCopy, Plus, Scale, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import {
  addOrdersAction,
  advanceBatchAction,
  commitWeighInAction,
  extendBatchAction,
  lockBatchAction,
  lockDueAction,
  removeOrderAction,
  rollBatchAction,
  saveBatchAction,
  summaryAction,
  weighInPreviewAction,
} from "@/app/admin/_actions/batches";
import { ErrorNote, Loading, MoneyInput, parseMinor, parseScaled, useAction, useLoaded } from "@/components/admin/dialogs/shared";
import { Sheet } from "@/components/admin/Sheet";
import { useToast } from "@/components/admin/Toast";
import { Badge, Field } from "@/components/admin/ui";
import { BATCH_SHIPPING_MODES, type BatchShippingMode, type BatchStatus } from "@/domain/enums";
import { BATCH_MODE_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import { cn } from "@/lib/utils";

function useDone() {
  const router = useRouter();
  const toast = useToast();
  return (m?: string) => {
    toast(m ?? "Saved");
    router.refresh();
  };
}

// ---- create / edit ----------------------------------------------------------------------------

export interface BatchFormValue {
  id: string | null;
  code: string;
  mode: BatchShippingMode;
  cutoffAt: string;
  minOrders: number;
  pickupStartsAt: string | null;
  pickupEndsAt: string | null;
  forwarder: string | null;
  notes: string | null;
}

/** <input type="datetime-local"> wants local "yyyy-MM-ddTHH:mm". */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function BatchFormButton({ value, label, className = "admin-btn-primary" }: { value: BatchFormValue | null; label: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? <BatchSheet value={value} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BatchSheet({ value, onClose }: { value: BatchFormValue | null; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({
    code: value?.code ?? "",
    mode: value?.mode ?? ("air" as BatchShippingMode),
    cutoffAt: toLocal(value?.cutoffAt ?? null),
    minOrders: String(value?.minOrders ?? 5),
    pickupStartsAt: toLocal(value?.pickupStartsAt ?? null),
    pickupEndsAt: toLocal(value?.pickupEndsAt ?? null),
    forwarder: value?.forwarder ?? "default",
    notes: value?.notes ?? "",
  });
  const { pending, error, fieldErrors, run } = useAction();
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={value ? `Edit ${value.code}` : "New batch"} description="Times are in your local time.">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" htmlFor={`${id}-c`} error={fieldErrors.code}>
            <input id={`${id}-c`} value={v.code} onChange={(e) => set("code", e.target.value)} placeholder="Air #13" className="admin-input" />
          </Field>
          <Field label="Mode" htmlFor={`${id}-m`}>
            <select id={`${id}-m`} value={v.mode} onChange={(e) => set("mode", e.target.value)} className="admin-input">
              {BATCH_SHIPPING_MODES.map((m) => (
                <option key={m} value={m}>
                  {BATCH_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cutoff" htmlFor={`${id}-cut`} error={fieldErrors.cutoffAt}>
            <input id={`${id}-cut`} type="datetime-local" value={v.cutoffAt} onChange={(e) => set("cutoffAt", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Minimum orders" htmlFor={`${id}-min`} error={fieldErrors.minOrders}>
            <input id={`${id}-min`} inputMode="numeric" value={v.minOrders} onChange={(e) => set("minOrders", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Pickup from — optional" htmlFor={`${id}-ps`}>
            <input id={`${id}-ps`} type="datetime-local" value={v.pickupStartsAt} onChange={(e) => set("pickupStartsAt", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Pickup until — optional" htmlFor={`${id}-pe`} error={fieldErrors.pickupEndsAt}>
            <input id={`${id}-pe`} type="datetime-local" value={v.pickupEndsAt} onChange={(e) => set("pickupEndsAt", e.target.value)} className="admin-input" />
          </Field>
          <Field label="Forwarder" htmlFor={`${id}-f`} hint="Must match a forwarder in Shipping rates.">
            <input id={`${id}-f`} value={v.forwarder} onChange={(e) => set("forwarder", e.target.value)} className="admin-input" />
          </Field>
        </div>
        <Field label="Notes — optional" htmlFor={`${id}-n`}>
          <textarea id={`${id}-n`} rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} className="admin-input" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
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
                  saveBatchAction({
                    id: value?.id ?? null,
                    code: v.code,
                    mode: v.mode,
                    cutoffAt: fromLocal(v.cutoffAt),
                    minOrders: Number(v.minOrders),
                    pickupStartsAt: fromLocal(v.pickupStartsAt),
                    pickupEndsAt: fromLocal(v.pickupEndsAt),
                    forwarder: v.forwarder || null,
                    notes: v.notes || null,
                  }),
                (d, m) => {
                  toast(m ?? "Saved");
                  onClose();
                  if (!value) router.push(`/admin/batches/${d.id}`);
                  else router.refresh();
                },
              )
            }
          >
            {value ? "Save" : "Create batch"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function LockDueButton() {
  const done = useDone();
  const { pending, run } = useAction();
  return (
    <button type="button" className="admin-btn-secondary" disabled={pending} onClick={() => run(() => lockDueAction(), (_, m) => done(m))}>
      Lock batches past cutoff
    </button>
  );
}

// ---- batch page actions ------------------------------------------------------------------------

const NEXT_LABEL: Partial<Record<BatchStatus, { to: BatchStatus; label: string }>> = {
  open: { to: "locked", label: "Lock now" },
  locked: { to: "consolidated", label: "Mark consolidated" },
  consolidated: { to: "shipped", label: "Mark shipped" },
  shipped: { to: "arrived", label: "Mark arrived in Malaysia" },
  arrived: { to: "distributed", label: "Mark distributed" },
};

export function BatchActions({ id, status, belowMin }: { id: string; status: BatchStatus; belowMin: boolean }) {
  const done = useDone();
  const { pending, error, run } = useAction();
  const next = NEXT_LABEL[status];
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-3">
      {belowMin && (status === "open" || status === "locked") ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <p className="font-medium">Below the minimum at cutoff.</p>
          <p className="mt-1 text-warning/80">Give it 48 more hours, or move its orders into the next batch.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="admin-btn-secondary" disabled={pending} onClick={() => run(() => extendBatchAction({ id }), (_, m) => done(m))}>
              Extend 48h
            </button>
            <button type="button" className="admin-btn-secondary" disabled={pending} onClick={() => confirm("Move every order into the next open batch and remove this one?") && run(() => rollBatchAction({ id }), (_, m) => done(m))}>
              Roll into next batch
            </button>
          </div>
        </div>
      ) : null}
      {next ? (
        confirming ? (
          <div className="flex gap-2">
            <button type="button" className="admin-btn-secondary flex-1" onClick={() => setConfirming(false)}>
              Back
            </button>
            <button
              type="button"
              className="admin-btn-primary flex-1"
              disabled={pending}
              onClick={() => run(() => (next.to === "locked" ? lockBatchAction({ id }) : advanceBatchAction({ id, to: next.to })), (_, m) => (setConfirming(false), done(m)))}
            >
              <Check className="size-4" aria-hidden />
              Confirm: {next.label.toLowerCase()}
            </button>
          </div>
        ) : (
          <button type="button" className="admin-btn-primary w-full" onClick={() => setConfirming(true)}>
            {next.label}
          </button>
        )
      ) : null}
      <ErrorNote message={error} />
    </div>
  );
}

export function RemoveOrderButton({ batchId, orderId }: { batchId: string; orderId: number }) {
  const done = useDone();
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      aria-label={`Remove #${orderId} from the batch`}
      title="Remove from batch"
      disabled={pending}
      onClick={() => run(() => removeOrderAction({ id: batchId, orderId }), (_, m) => done(m))}
      className="grid size-9 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-destructive"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

export function AddOrdersButton({ batchId, candidates }: { batchId: string; candidates: Array<{ id: number; itemName: string; status: string }> }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const done = useDone();
  const { pending, error, run } = useAction();
  return (
    <>
      <button type="button" className="admin-btn-secondary" disabled={candidates.length === 0} onClick={() => setOpen(true)} title={candidates.length ? undefined : "No orders waiting for this mode"}>
        <Plus className="size-4" aria-hidden />
        Add orders{candidates.length ? ` (${candidates.length})` : ""}
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Add orders" description="Orders of this mode that aren't in a batch yet.">
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.id}>
              <label className="admin-card flex cursor-pointer items-center gap-3 p-3 text-sm has-checked:border-sky-400/60">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} className="size-5 accent-sky-500" />
                <span className="flex-1">
                  #{c.id} {c.itemName}
                </span>
                <Badge>{c.status.replace(/_/g, " ")}</Badge>
              </label>
            </li>
          ))}
        </ul>
        <ErrorNote message={error} className="mt-4" />
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={pending || picked.length === 0}
            onClick={() => run(() => addOrdersAction({ id: batchId, orderIds: picked }), (_, m) => (setOpen(false), setPicked([]), done(m)))}
          >
            Add {picked.length || ""}
          </button>
        </div>
      </Sheet>
    </>
  );
}

// ---- consolidation summary --------------------------------------------------------------------

export function SummaryButton({ batchId }: { batchId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="admin-btn-secondary" onClick={() => setOpen(true)}>
        <ClipboardCopy className="size-4" aria-hidden />
        Consolidation summary
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Consolidation summary" description="Copy this to the forwarder.">
        <SummaryBody batchId={batchId} />
      </Sheet>
    </>
  );
}

function SummaryBody({ batchId }: { batchId: string }) {
  const s = useLoaded(() => summaryAction({ id: batchId }));
  const [copied, setCopied] = useState(false);
  if (s.loading) return <Loading />;
  if (!s.data) return <ErrorNote message={s.error} />;
  return (
    <div className="space-y-4">
      <pre className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{s.data.text}</pre>
      <button
        type="button"
        className="admin-btn-primary w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(s.data!.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy text"}
      </button>
    </div>
  );
}

// ---- weigh-in --------------------------------------------------------------------------------

type Preview = Extract<Awaited<ReturnType<typeof weighInPreviewAction>>, { ok: true }>["data"];

export function WeighInButton({ batchId, defaultRate, weighed }: { batchId: string; defaultRate: string; weighed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="admin-btn-secondary" disabled={weighed} onClick={() => setOpen(true)} title={weighed ? "Already weighed in" : undefined}>
        <Scale className="size-4" aria-hidden />
        {weighed ? "Weighed in" : "Weigh-in"}
      </button>
      {open ? <WeighInSheet batchId={batchId} defaultRate={defaultRate} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WeighInSheet({ batchId, defaultRate, onClose }: { batchId: string; defaultRate: string; onClose: () => void }) {
  const id = useId();
  const done = useDone();
  const [weight, setWeight] = useState("");
  const [cost, setCost] = useState("");
  const [rate, setRate] = useState(String(Number(defaultRate)));
  const [preview, setPreview] = useState<Preview | null>(null);
  const { pending, error, fieldErrors, run } = useAction();
  const input = () => ({ id: batchId, actualWeightG: parseScaled(weight, 1000) ?? 0, actualCostFen: parseMinor(cost) ?? 0, fxRate: rate.trim() });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title="Weigh-in" description="Enter the forwarder's numbers, check every order's adjustment, then post." size="lg">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Actual batch weight (kg)" htmlFor={`${id}-w`} error={fieldErrors.actualWeightG}>
            <input id={`${id}-w`} inputMode="decimal" value={weight} onChange={(e) => (setWeight(e.target.value), setPreview(null))} className="admin-input" />
          </Field>
          <Field label="Forwarder's bill" htmlFor={`${id}-c`} error={fieldErrors.actualCostFen}>
            <MoneyInput id={`${id}-c`} currency="¥" value={cost} onChange={(v) => (setCost(v), setPreview(null))} />
          </Field>
          <Field label="Rate (MYR per ¥1)" htmlFor={`${id}-r`} error={fieldErrors.fxRate}>
            <input id={`${id}-r`} inputMode="decimal" value={rate} onChange={(e) => (setRate(e.target.value), setPreview(null))} className="admin-input" />
          </Field>
        </div>
        <button type="button" className="admin-btn-secondary w-full" disabled={pending} onClick={() => run(() => weighInPreviewAction(input()), (d) => setPreview(d))}>
          Preview adjustments
        </button>
        {preview ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-white/55">
                  <tr>
                    <th className="pb-2 font-normal">Order</th>
                    <th className="pb-2 font-normal">Billable</th>
                    <th className="pb-2 text-right font-normal">Actual</th>
                    <th className="pb-2 text-right font-normal">Paid</th>
                    <th className="pb-2 text-right font-normal">Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.orderId} className="border-t border-white/10">
                      <td className="py-2">
                        #{r.orderId}
                        {r.parcelSource !== "final" ? <span className="ml-1 text-xs text-warning">({r.parcelSource === "missing" ? "no size" : "estimate"})</span> : null}
                      </td>
                      <td className="py-2 tabular-nums">{(r.billableG / 1000).toFixed(2)} kg</td>
                      <td className="py-2 text-right tabular-nums">{formatMyr(r.actualSen)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMyr(r.paidSen)}</td>
                      <td className={cn("py-2 text-right tabular-nums", r.result.ledgerAmountSen > 0 && "text-warning", r.result.ledgerAmountSen < 0 && "text-success")}>
                        {r.result.ledgerAmountSen === 0 ? "—" : r.result.ledgerAmountSen > 0 ? `+${formatMyr(r.result.ledgerAmountSen)}` : `−${formatMyr(-r.result.ledgerAmountSen)}`}
                        {r.result.absorbedSen > 0 ? <span className="block text-xs text-white/45">you absorb {formatMyr(r.result.absorbedSen)}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-2 rounded-xl border border-white/10 p-4 text-sm sm:grid-cols-2">
              <div className="flex justify-between">
                <dt className="text-white/55">Students to pay</dt>
                <dd className="tabular-nums">{formatMyr(preview.totals.chargeSen)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/55">Credits</dt>
                <dd className="tabular-nums">{formatMyr(preview.totals.creditSen)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/55">Shipping charged (final)</dt>
                <dd className="tabular-nums">{formatMyr(preview.totals.actualSen)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/55">Forwarder&apos;s bill</dt>
                <dd className="tabular-nums">{formatMyr(preview.batchCostSen)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="admin-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            disabled={pending || !preview || preview.alreadyWeighed}
            onClick={() => run(() => commitWeighInAction(input()), (_, m) => (onClose(), done(m)))}
          >
            Post {preview?.rows.filter((r) => r.result.ledgerAmountSen !== 0).length ?? 0} adjustments
          </button>
        </div>
      </div>
    </Sheet>
  );
}
