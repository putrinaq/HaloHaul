"use client";

import { ShieldAlert } from "lucide-react";
import { useId, useState } from "react";
import {
  assignBatchAction,
  clearRestrictedAction,
  issueRefundAction,
  loadBatchContext,
  loadQcContext,
  loadRefundContext,
  recordQcAction,
  rejectOrderAction,
} from "@/app/admin/_actions/orders";
import { Field } from "@/components/admin/ui";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
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

// ---- Record QC -----------------------------------------------------------------------

/** Warehouse arrival + quality check: final weight and size (used at the weigh-in), photos, notes. */
export function QcDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Record QC" description={`Order #${orderId}`} size="lg">
      <QcBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function QcBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadQcContext({ orderId }));
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  return <QcForm ctx={ctx.data} onDone={onDone} onCancel={onCancel} />;
}

type QcCtx = Extract<Awaited<ReturnType<typeof loadQcContext>>, { ok: true }>["data"];

function QcForm({ ctx, onDone, onCancel }: { ctx: QcCtx; onDone: (m: string) => void; onCancel: () => void }) {
  const id = useId();
  const o = ctx.order;
  const today = new Date().toISOString().slice(0, 10);
  const [arrived, setArrived] = useState(o.warehouseArrivedAt ? new Date(o.warehouseArrivedAt).toISOString().slice(0, 10) : today);
  const [weight, setWeight] = useState(scaledToInput(o.finalWeightG, 1000));
  const [length, setLength] = useState(scaledToInput(o.finalLengthMm, 10));
  const [width, setWidth] = useState(scaledToInput(o.finalWidthMm, 10));
  const [height, setHeight] = useState(scaledToInput(o.finalHeightMm, 10));
  const [photos, setPhotos] = useState<UploadedImage[]>(ctx.photos);
  const [notes, setNotes] = useState(o.qcNotes ?? "");
  const { pending, error, fieldErrors, run } = useAction();
  const num = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);

  function save() {
    run(
      () =>
        recordQcAction({
          orderId: o.id,
          arrivedAt: arrived,
          finalWeightG: num(parseScaled(weight, 1000)),
          finalLengthMm: num(parseScaled(length, 10)),
          finalWidthMm: num(parseScaled(width, 10)),
          finalHeightMm: num(parseScaled(height, 10)),
          qcPhotoKeys: photos.map((p) => p.key),
          qcNotes: notes || null,
        }),
      (_, m) => onDone(m ?? "QC recorded"),
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <span className="font-medium">{o.itemName}</span>
        <span className="text-white/55"> · quantity {o.quantity}{o.estWeightG ? ` · estimated ${(o.estWeightG / 1000).toFixed(2)} kg` : ""}</span>
      </p>
      <Field label="Arrived at the warehouse" htmlFor={`${id}-d`} error={fieldErrors.arrivedAt}>
        <input id={`${id}-d`} type="date" value={arrived} max={today} onChange={(e) => setArrived(e.target.value)} className="admin-input" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-white/85">Final size (whole order, packed)</legend>
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
        <p className="mt-2 text-xs text-white/50">Used for this order&apos;s shipping at the batch weigh-in.</p>
      </fieldset>
      <Field label="QC photos" htmlFor={`${id}-ph`}>
        <ImagesInput value={photos} onChange={setPhotos} purpose="qc" max={12} />
      </Field>
      <Field label="QC notes — optional" htmlFor={`${id}-n`} hint="Visible to the team only.">
        <textarea id={`${id}-n`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        <button type="button" onClick={save} disabled={pending} className="admin-btn-primary">
          {pending ? "Saving…" : o.status === "at_warehouse" ? "Save and move to QC review" : "Save QC"}
        </button>
      </DrawerActions>
    </div>
  );
}

// ---- Add to batch ---------------------------------------------------------------------

export function BatchDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add to batch" description={`Order #${orderId}`}>
      <BatchBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function BatchBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadBatchContext({ orderId }));
  const [choice, setChoice] = useState<string | null | undefined>(undefined);
  const { pending, error, run } = useAction();
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  const { order, batches } = ctx.data;
  const selected = choice === undefined ? order.batchId : choice;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{order.itemName}</span>
        <span className="text-white/55"> · {order.shippingMode}</span>
      </p>
      {batches.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/60">
          No open {order.shippingMode} batch. Create one on the Batches page first.
        </p>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label="Batch">
          {batches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                role="radio"
                aria-checked={selected === b.id}
                onClick={() => setChoice(b.id)}
                className={cn("admin-card flex w-full items-center justify-between gap-3 p-4 text-left transition-colors", selected === b.id ? "border-sky-400/60 bg-sky-500/5" : "hover:border-white/25")}
              >
                <span>
                  <span className="block font-medium">{b.code}</span>
                  <span className="text-xs text-white/55">
                    Cutoff {fmtDate(b.cutoffAt, "d MMM, h:mm a")} · {b.status}
                  </span>
                </span>
                <span className={cn("text-sm tabular-nums", b.orderCount < b.minOrders ? "text-warning" : "text-success")}>
                  {b.orderCount}/{b.minOrders}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        {order.batchId ? (
          <button type="button" className="admin-btn-secondary" disabled={pending} onClick={() => run(() => assignBatchAction({ orderId, batchId: null }), (_, m) => onDone(m ?? "Removed"))}>
            Remove from batch
          </button>
        ) : null}
        <button
          type="button"
          className="admin-btn-primary"
          disabled={pending || !selected || selected === order.batchId}
          onClick={() => run(() => assignBatchAction({ orderId, batchId: selected }), (_, m) => onDone(m ?? "Added to batch"))}
        >
          {order.batchId ? "Move to this batch" : "Add to batch"}
        </button>
      </DrawerActions>
    </div>
  );
}

// ---- Refund / credit -------------------------------------------------------------------

export function RefundDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Issue refund or credit" description={`Order #${orderId}`}>
      <RefundBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function RefundBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadRefundContext({ orderId }));
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  return <RefundForm ctx={ctx.data} onDone={onDone} onCancel={onCancel} />;
}

type RefundCtx = Extract<Awaited<ReturnType<typeof loadRefundContext>>, { ok: true }>["data"];

export function RefundForm({ ctx, onDone, onCancel }: { ctx: RefundCtx; onDone: (m: string) => void; onCancel: () => void }) {
  const id = useId();
  const hasCredit = ctx.creditSen > 0;
  const [amount, setAmount] = useState(minorToInput(hasCredit ? ctx.creditSen : null));
  const [method, setMethod] = useState<"credit_balance" | "bank_transfer">("bank_transfer");
  const [reason, setReason] = useState(hasCredit ? "Shipping weigh-in came in under the estimate" : "");
  const { pending, error, fieldErrors, run } = useAction();
  const amountSen = parseMinor(amount);

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <p className="font-medium">{ctx.order.itemName}</p>
        <p className="text-white/55">{ctx.customer.name}</p>
        <p className="mt-2">
          {hasCredit ? (
            <>
              This order has <strong className="text-success">{formatMyr(ctx.creditSen)}</strong> in credit for the student.
            </>
          ) : (
            "No credit on this order yet. This issues a new credit (goodwill, a problem with the item)."
          )}
        </p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-white/85">How</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["bank_transfer", "Bank transfer", "You send the money back. Posts the payout to the ledger."],
              ["credit_balance", "Keep as credit", "Stays on their HaloHaul balance for the next order."],
            ] as const
          ).map(([v, title, body]) => (
            <label key={v} className={cn("admin-card flex cursor-pointer gap-3 p-3 text-sm", method === v && "border-sky-400/60 bg-sky-500/5")}>
              <input type="radio" name={`${id}-m`} checked={method === v} onChange={() => setMethod(v)} className="mt-1 accent-sky-500" />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-xs text-white/55">{body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Amount" htmlFor={`${id}-a`} error={fieldErrors.amountSen}>
        <MoneyInput id={`${id}-a`} currency="RM" value={amount} onChange={setAmount} invalid={!!fieldErrors.amountSen} />
      </Field>
      <Field label="Reason" htmlFor={`${id}-r`} error={fieldErrors.reason}>
        <input id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        <button
          type="button"
          className="admin-btn-primary"
          disabled={pending || amountSen === null || !Number.isFinite(amountSen) || amountSen <= 0}
          onClick={() =>
            run(
              () =>
                issueRefundAction({
                  customerId: ctx.customer.id,
                  orderId: ctx.order.id,
                  amountSen,
                  method,
                  reason,
                  fromExistingCredit: hasCredit,
                }),
              (_, m) => onDone(m ?? "Done"),
            )
          }
        >
          {pending ? "Saving…" : method === "bank_transfer" ? "Record refund" : "Keep as credit"}
        </button>
      </DrawerActions>
    </div>
  );
}

// ---- Restricted item review ----------------------------------------------------------------

export function RestrictedDialog({ orderId, open, onOpenChange, onDone, reasonText }: DialogProps & { reasonText?: string | null }) {
  const id = useId();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { pending, error, fieldErrors, run } = useAction();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Review restricted item" description={`Order #${orderId}`}>
      <div className="space-y-5">
        <p className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{reasonText ?? "This order matched a restricted keyword."} Check the shipping line can carry it before quoting.</span>
        </p>
        <Field label={rejecting ? "Reason (the student sees this)" : "Note — optional"} htmlFor={`${id}-n`} error={fieldErrors.reason ?? fieldErrors.note}>
          <textarea
            id={`${id}-n`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="admin-input"
            placeholder={rejecting ? "e.g. Lithium batteries can't ship on any line we use." : "e.g. Checked: no battery inside."}
          />
        </Field>
        <ErrorNote message={error} />
        <DrawerActions onCancel={() => onOpenChange(false)}>
          {rejecting ? (
            <>
              <button type="button" className="admin-btn-secondary" onClick={() => setRejecting(false)}>
                Back
              </button>
              <button type="button" className="admin-btn-danger" disabled={pending} onClick={() => run(() => rejectOrderAction({ orderId, reason: note }), (_, m) => onDone(m ?? "Rejected"))}>
                Reject order
              </button>
            </>
          ) : (
            <>
              <button type="button" className="admin-btn-danger" onClick={() => setRejecting(true)}>
                Can&apos;t ship it
              </button>
              <button type="button" className="admin-btn-primary" disabled={pending} onClick={() => run(() => clearRestrictedAction({ orderId, note }), (_, m) => onDone(m ?? "Cleared"))}>
                Clear and continue
              </button>
            </>
          )}
        </DrawerActions>
      </div>
    </Sheet>
  );
}
