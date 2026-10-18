"use client";

import { Check, ImagePlus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { PaymentPurpose } from "@/domain/enums";
import { formatCny, formatMyr } from "@/domain/money";
import { cn } from "@/lib/utils";
import { acceptQuoteAction, cancelAction, chooseOptionAction, declineQuoteAction, replyAction, submitProofAction, type StudentResult } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (call: () => Promise<StudentResult>, after?: () => void) => {
    setError(null);
    start(async () => {
      try {
        const r = await call();
        if (r.ok) {
          after?.();
          router.refresh();
        } else setError(r.error);
      } catch {
        setError("Something went wrong. Check your connection and try again.");
      }
    });
  };
  return { pending, error, run };
}

function Err({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export interface StudentOption {
  id: string;
  title: string;
  url: string;
  priceFen: number;
  sellerNote: string | null;
  photoUrl: string | null;
  isRecommended: boolean;
  isSelected: boolean;
}

/** Sourcing options to choose from; the pick can change until the quote arrives. */
export function OptionPicker({ orderId, options }: { orderId: number; options: StudentOption[] }) {
  const { pending, error, run } = useRun();
  return (
    <section className="space-y-4 rounded-2xl bg-card p-5">
      <div>
        <h2 className="font-medium">Choose an option</h2>
        <p className="mt-1 text-sm text-muted-foreground">We found these. Pick one and we&apos;ll send a full quote for it.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.id} className={cn("flex flex-col rounded-2xl border p-3", o.isSelected ? "border-white bg-white/5" : "border-white/12")}>
            {o.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
              <img src={o.photoUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
            ) : null}
            <p className="mt-3 flex flex-wrap items-center gap-2 font-medium">
              {o.title}
              {o.isRecommended ? (
                <span className="inline-flex items-center gap-1 text-xs text-warning">
                  <Star className="size-3 fill-current" aria-hidden />
                  Our pick
                </span>
              ) : null}
            </p>
            <p className="text-sm tabular-nums">{formatCny(o.priceFen)} each</p>
            {o.sellerNote ? <p className="mt-1 text-sm text-muted-foreground">{o.sellerNote}</p> : null}
            <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 text-sm underline underline-offset-2">
              View listing
            </a>
            <div className="mt-auto pt-3">
              {o.isSelected ? (
                <p className="flex h-11 items-center justify-center gap-2 rounded-lg bg-white/10 text-sm">
                  <Check className="size-4" aria-hidden />
                  Your choice
                </p>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => chooseOptionAction({ orderId, optionId: o.id }))} className="btn-secondary w-full">
                  Choose this one
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Err message={error} />
    </section>
  );
}

/** Accept (moves to payment) or decline (cancels the order). */
export function QuoteResponse({ orderId, totalLabel, feeKept }: { orderId: number; totalLabel: string; feeKept: boolean }) {
  const { pending, error, run } = useRun();
  const [declining, setDeclining] = useState(false);
  return (
    <div className="space-y-3">
      {declining ? (
        <div className="space-y-3 rounded-xl border border-white/12 p-4 text-sm">
          <p>Decline this quote? This cancels the order{feeKept ? " (the search fee isn't refunded)" : ""}.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setDeclining(false)}>
              Keep it
            </button>
            <button type="button" className="btn-secondary flex-1 text-destructive" disabled={pending} onClick={() => run(() => declineQuoteAction({ orderId }))}>
              Decline and cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary flex-1" disabled={pending} onClick={() => run(() => acceptQuoteAction({ orderId }))}>
            {pending ? "One moment…" : `Accept and pay ${totalLabel}`}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      )}
      <Err message={error} />
    </div>
  );
}

async function uploadProof(file: File): Promise<string> {
  const presign = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const p = await presign.json();
  if (!presign.ok) throw new Error(p.error ?? "Upload failed");
  const put = await fetch(p.url, { method: "PUT", headers: p.headers, body: file }).catch(() => null);
  if (!put?.ok) throw new Error("Upload failed. Check your connection and try again.");
  const fin = await fetch("/api/uploads/finalize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: p.key, purpose: "payment_proof" }),
  });
  const f = await fin.json();
  if (!fin.ok) throw new Error(f.error ?? "Upload failed");
  return f.key;
}

/** DuitNow QR, the amount due, and the proof upload. */
export function PayPanel({
  orderId,
  purpose,
  title,
  amountDueSen,
  qrUrl,
  note,
  waiting,
  rejectedReason,
  uploadsEnabled,
}: {
  orderId: number;
  purpose: PaymentPurpose;
  title: string;
  amountDueSen: number;
  qrUrl: string | null;
  note: string;
  waiting: { amountSen: number } | null;
  rejectedReason: string | null;
  uploadsEnabled: boolean;
}) {
  const id = useId();
  const [amount, setAmount] = useState((amountDueSen / 100).toFixed(2));
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { pending, error, run } = useRun();
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function send() {
    if (!file) return setUploadError("Add a screenshot of the payment.");
    const sen = Math.round(Number(amount) * 100);
    if (!Number.isFinite(sen) || sen <= 0) return setUploadError("Enter the amount you paid.");
    setUploadError(null);
    setUploading(true);
    let key: string;
    try {
      key = await uploadProof(file);
    } catch (e) {
      setUploading(false);
      return setUploadError((e as Error).message);
    }
    setUploading(false);
    run(() => submitProofAction({ orderId, purpose, amountSen: sen, proofKey: key, reference: reference || null }), () => setFile(null));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-brand/30 bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <p className="text-2xl font-medium tabular-nums">{formatMyr(amountDueSen)}</p>
      </div>
      {waiting ? (
        <p className="rounded-xl bg-white/5 p-3 text-sm">
          Thanks! We got your proof for {formatMyr(waiting.amountSen)} and we&apos;re checking it. You&apos;ll see the update here.
        </p>
      ) : (
        <>
          {rejectedReason ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Your last proof couldn&apos;t be accepted: {rejectedReason}. Please send a new one.
            </p>
          ) : null}
          <div className="flex flex-col gap-4 sm:flex-row">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
              <img src={qrUrl} alt="DuitNow QR code" className="mx-auto w-48 rounded-xl bg-white p-2 sm:mx-0" />
            ) : null}
            <div className="flex-1 space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Pay with DuitNow</p>
              <p className="whitespace-pre-line">{note}</p>
            </div>
          </div>
          {uploadsEnabled ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Amount paid (RM)</span>
                  <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-transparent px-3" />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="font-medium">Reference — optional</span>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-transparent px-3" />
                </label>
              </div>
              <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/25 px-4 text-sm hover:border-white/50">
                <ImagePlus className="size-5 shrink-0" aria-hidden />
                {file ? file.name : "Add the payment screenshot"}
              </label>
              <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button type="button" onClick={send} disabled={pending || uploading} className="btn-primary w-full">
                {uploading ? "Uploading…" : pending ? "Sending…" : "Send proof of payment"}
              </button>
              <Err message={uploadError ?? error} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Send the screenshot to us on WhatsApp — uploads aren&apos;t switched on yet.</p>
          )}
        </>
      )}
    </section>
  );
}

export function ReplyForm({ orderId, question }: { orderId: number; question: string | null }) {
  const id = useId();
  const [reply, setReply] = useState("");
  const { pending, error, run } = useRun();
  return (
    <section className="space-y-3 rounded-2xl border border-warning/30 bg-card p-5">
      <h2 className="font-medium">We need a little more info</h2>
      {question ? <p className="rounded-xl bg-white/5 p-3 text-sm whitespace-pre-line">{question}</p> : null}
      <label htmlFor={id} className="text-sm font-medium">
        Your reply
      </label>
      <textarea id={id} rows={4} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full rounded-lg border border-input bg-transparent p-3 text-base" />
      <button type="button" className="btn-primary w-full sm:w-auto" disabled={pending} onClick={() => run(() => replyAction({ orderId, reply }), () => setReply(""))}>
        {pending ? "Sending…" : "Send reply"}
      </button>
      <Err message={error} />
    </section>
  );
}

export function CancelOrder({ orderId, paid }: { orderId: number; paid: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { pending, error, run } = useRun();
  if (!confirming) {
    return (
      <button type="button" className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setConfirming(true)}>
        Cancel this order
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-white/12 p-4 text-sm">
      <p>Cancel this order?{paid ? " What you paid comes back as a refund." : ""}</p>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={() => setConfirming(false)}>
          Keep it
        </button>
        <button type="button" className="btn-secondary flex-1 text-destructive" disabled={pending} onClick={() => run(() => cancelAction({ orderId, reason: null }))}>
          Cancel order
        </button>
      </div>
      <Err message={error} />
    </div>
  );
}
