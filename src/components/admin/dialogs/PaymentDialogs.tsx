"use client";

import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import {
  confirmPaymentAction,
  loadPaymentContext,
  markFeePaidAction,
  recordPaymentAction,
  rejectPaymentAction,
} from "@/app/admin/_actions/orders";
import { Field } from "@/components/admin/ui";
import type { PaymentPurpose } from "@/domain/enums";
import { formatMyr } from "@/domain/money";
import { fmtDateTime } from "@/lib/format";
import { Sheet } from "../Sheet";
import { DrawerActions, ErrorNote, Loading, MoneyInput, minorToInput, parseMinor, useAction, useLoaded, type DialogProps } from "./shared";

const PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  upfront_fee: "Upfront fee",
  order: "Order payment",
  balance: "Shipping balance",
};

/** Proofs waiting for this order: confirm (posts the payment) or reject with a reason the student sees. */
export function PaymentDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Confirm payment" description={`Order #${orderId}`}>
      <PaymentBody orderId={orderId} onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function PaymentBody({ orderId, onDone, onCancel }: { orderId: number; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadPaymentContext({ orderId }));
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { pending, error, fieldErrors, run } = useAction();

  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  const d = ctx.data;

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <p className="font-medium">{d.order.itemName}</p>
        <p className="text-white/55">{d.order.customerName}</p>
        <p className="mt-2">
          Owed now: <strong className="tabular-nums">{formatMyr(d.owedSen)}</strong>
          {d.quoteTotalSen !== null ? <span className="text-white/55"> · quote {formatMyr(d.quoteTotalSen)}</span> : null}
        </p>
      </div>

      {d.pending.length === 0 ? <p className="text-sm text-white/60">No proofs are waiting. They may have been handled already.</p> : null}

      {d.pending.map((p) => {
        const mismatch = p.purpose !== "upfront_fee" && d.owedSen > 0 && p.amountSen !== d.owedSen;
        return (
          <article key={p.id} className="admin-card space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{PURPOSE_LABELS[p.purpose]}</p>
                <p className="text-xs text-white/50">Uploaded {fmtDateTime(p.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-medium tabular-nums">{formatMyr(p.amountSen)}</p>
                <p className="text-xs text-white/50">claimed</p>
              </div>
            </div>
            {mismatch ? <p className="text-xs text-warning">Claimed amount differs from what&apos;s owed ({formatMyr(d.owedSen)}).</p> : null}
            {p.reference ? <p className="text-sm">Reference: <span className="font-mono">{p.reference}</span></p> : null}
            {p.proof ? (
              <a href={p.proof.full} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL */}
                <img src={p.proof.full} alt="Payment proof" className="max-h-96 w-full rounded-xl border border-white/10 object-contain" />
              </a>
            ) : (
              <p className="text-sm text-white/50">The proof image isn&apos;t available here.</p>
            )}
            {rejecting === p.id ? (
              <div className="space-y-2">
                <Field label="Reason (the student sees this)" htmlFor={`reason-${p.id}`} error={fieldErrors.reason}>
                  <input id={`reason-${p.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input" placeholder="e.g. Amount doesn't match the quote" />
                </Field>
                <div className="flex gap-2">
                  <button type="button" className="admin-btn-secondary flex-1" onClick={() => setRejecting(null)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="admin-btn-danger flex-1"
                    disabled={pending}
                    onClick={() => run(() => rejectPaymentAction({ paymentId: p.id, reason }), (_, m) => onDone(m ?? "Proof rejected"))}
                  >
                    Reject proof
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" className="admin-btn-secondary flex-1" onClick={() => (setRejecting(p.id), setReason(""))}>
                  <X className="size-4" aria-hidden />
                  Reject
                </button>
                <button
                  type="button"
                  className="admin-btn-primary flex-1"
                  disabled={pending}
                  onClick={() => run(() => confirmPaymentAction({ paymentId: p.id }), (_, m) => onDone(m ?? "Payment confirmed"))}
                >
                  <Check className="size-4" aria-hidden />
                  {pending ? "Saving…" : `Confirm ${formatMyr(p.amountSen)}`}
                </button>
              </div>
            )}
          </article>
        );
      })}
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel} cancelLabel="Close" />
    </div>
  );
}

/** Upfront reverse-search / consultation fee received without a proof (or confirmed by eye). */
export function FeeDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Mark fee paid" description={`Order #${orderId}`}>
      <RecordBody orderId={orderId} purpose="upfront_fee" onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

/** Order payment received without a proof (cash, or a transfer seen in the bank app). */
export function RecordPaymentDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Record payment" description={`Order #${orderId}`}>
      <RecordBody orderId={orderId} purpose="order" onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

/** Shipping balance owed after reconciliation: record what was received. */
export function BalanceDialog({ orderId, open, onOpenChange, onDone }: DialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Collect balance" description={`Order #${orderId}`}>
      <RecordBody orderId={orderId} purpose="balance" onDone={onDone} onCancel={() => onOpenChange(false)} />
    </Sheet>
  );
}

function RecordBody({ orderId, purpose, onDone, onCancel }: { orderId: number; purpose: PaymentPurpose; onDone: (m: string) => void; onCancel: () => void }) {
  const ctx = useLoaded(() => loadPaymentContext({ orderId }));
  if (ctx.loading) return <Loading />;
  if (!ctx.data) return <ErrorNote message={ctx.error} />;
  const suggested = purpose === "upfront_fee" ? (ctx.data.feeSen ?? 0) : ctx.data.owedSen;
  return <RecordForm orderId={orderId} purpose={purpose} suggestedSen={suggested} itemName={ctx.data.order.itemName} onDone={onDone} onCancel={onCancel} />;
}

function RecordForm({
  orderId,
  purpose,
  suggestedSen,
  itemName,
  onDone,
  onCancel,
}: {
  orderId: number;
  purpose: PaymentPurpose;
  suggestedSen: number;
  itemName: string;
  onDone: (m: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState(minorToInput(suggestedSen));
  const [reference, setReference] = useState("");
  const { pending, error, fieldErrors, run } = useAction();
  const amountSen = parseMinor(amount);

  function save() {
    if (amountSen === null || !Number.isFinite(amountSen)) return;
    const payload = { orderId, amountSen, reference: reference || null };
    run(
      () => (purpose === "upfront_fee" ? markFeePaidAction(payload) : recordPaymentAction({ ...payload, purpose })),
      (_, m) => onDone(m ?? "Saved"),
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <span className="font-medium">{itemName}</span>
        <br />
        <span className="text-white/55">
          {purpose === "upfront_fee"
            ? "Records the upfront fee as received and posts it to the ledger."
            : purpose === "order"
              ? "Records money received for this order. Once nothing is owed, the order moves to Paid."
              : "Records money received for the shipping balance."}
        </span>
      </p>
      <Field label="Amount received" htmlFor={`${id}-amt`} error={fieldErrors.amountSen}>
        <MoneyInput id={`${id}-amt`} currency="RM" value={amount} onChange={setAmount} invalid={!!fieldErrors.amountSen} />
      </Field>
      <Field label="Reference — optional" htmlFor={`${id}-ref`} hint="Bank reference, or how it was paid.">
        <input id={`${id}-ref`} value={reference} onChange={(e) => setReference(e.target.value)} className="admin-input" />
      </Field>
      <ErrorNote message={error} />
      <DrawerActions onCancel={onCancel}>
        <button type="button" onClick={save} disabled={pending || amountSen === null || !Number.isFinite(amountSen) || amountSen <= 0} className="admin-btn-primary">
          {pending ? "Saving…" : purpose === "upfront_fee" ? "Mark fee paid" : "Record payment"}
        </button>
      </DrawerActions>
    </div>
  );
}
