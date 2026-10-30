"use client";

import { CircleCheck, CircleAlert, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_SUBMIT_AT_ONCE, type DraftSummary } from "@/domain/drafts";
import { PATH_LABELS } from "@/domain/labels";
import { orderNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { removeDraftAction, submitDraftsAction, type SubmitDraftOutcome } from "./actions";

export interface CartItem {
  id: string;
  savedOn: string;
  summary: DraftSummary;
}

export function CartList({ items, addedId }: { items: CartItem[]; addedId: string | null }) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Array<{ orderId: number; name: string }>>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = items.filter((i) => i.summary.ready);
  const toSubmit = ready.slice(0, MAX_SUBMIT_AT_ONCE);

  function remove(id: string) {
    if (confirmRemove !== id) return setConfirmRemove(id);
    startTransition(async () => {
      await removeDraftAction(id);
      setConfirmRemove(null);
      router.refresh();
    });
  }

  function submitReady() {
    setFormError(null);
    startTransition(async () => {
      const res = await submitDraftsAction({ ids: toSubmit.map((i) => i.id), acceptTerms: accepted });
      if (res.error) return setFormError(res.error);
      const names = new Map(items.map((i) => [i.id, i.summary.itemName]));
      const ok = res.outcomes.filter((o): o is Extract<SubmitDraftOutcome, { ok: true }> => o.ok);
      setSubmitted((s) => [...s, ...ok.map((o) => ({ orderId: o.orderId, name: names.get(o.id) ?? "" }))]);
      setErrors(Object.fromEntries(res.outcomes.filter((o) => !o.ok).map((o) => [o.id, (o as { error: string }).error])));
      setAccepted(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      {addedId && submitted.length === 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Saved to your cart.
          <Link href="/order/new" className="ml-auto underline underline-offset-2">
            Add another
          </Link>
        </p>
      ) : null}

      {submitted.length > 0 ? (
        <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <p className="font-medium">
            {submitted.length} order{submitted.length === 1 ? "" : "s"} sent. We&apos;ll reply with a quote for each.
          </p>
          <ul className="mt-2 space-y-1">
            {submitted.map((s) => (
              <li key={s.orderId}>
                <Link href={`/orders/${s.orderId}`} className="underline underline-offset-2">
                  {orderNo(s.orderId)} {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length === 0 ? (
        submitted.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-10 text-center">
            <span className="icon-chip size-12">
              <ShoppingCart className="size-5" aria-hidden />
            </span>
            <p className="mt-4 font-medium">Your cart is empty</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Start an order and press <span className="text-foreground">Add to cart</span> to save it for later.
            </p>
            <Link href="/order/new" className="btn-primary mt-6 w-full sm:w-auto">
              Start an order
            </Link>
          </div>
        ) : null
      ) : (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
          {items.map((item) => {
            const s = item.summary;
            const error = errors[item.id];
            return (
              <li key={item.id} className={cn("p-4", item.id === addedId && "bg-white/3")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.itemName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[s.pathType ? PATH_LABELS[s.pathType] : null, s.categoryName, s.quantity > 1 ? `× ${s.quantity}` : null, `saved ${item.savedOn}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {s.ready && !error ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-200">
                        <CircleCheck className="size-3.5" aria-hidden />
                        Ready to submit
                      </p>
                    ) : (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200">
                        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                        <span>
                          {error ??
                            `${s.missing} thing${s.missing === 1 ? "" : "s"} to finish${s.firstProblem ? `: ${s.firstProblem}` : ""}`}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link href={`/order/new?draft=${item.id}`} className="btn-secondary h-10 px-3 text-sm">
                      {s.ready ? "Open" : "Finish"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      onBlur={() => setConfirmRemove((c) => (c === item.id ? null : c))}
                      disabled={pending}
                      aria-label={confirmRemove === item.id ? `Tap again to remove ${s.itemName}` : `Remove ${s.itemName}`}
                      className={cn(
                        "grid h-10 min-w-10 place-items-center rounded-lg px-2 text-sm transition-colors",
                        confirmRemove === item.id ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                      )}
                    >
                      {confirmRemove === item.id ? "Remove?" : <Trash2 className="size-4" aria-hidden />}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 ? (
        <div className="space-y-4 rounded-2xl bg-card p-4 sm:p-5">
          {ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">Finish an item to submit it from here.</p>
          ) : (
            <>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox className="mt-0.5" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
                <span>
                  I&apos;ve read the{" "}
                  <Link href="/terms" target="_blank" className="underline">
                    Terms &amp; Conditions
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="underline">
                    Privacy Policy
                  </Link>
                  : free cancellation until we buy the item, shipping is an estimate until the weigh-in.
                </span>
              </label>
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <button type="button" onClick={submitReady} disabled={!accepted || pending} className="btn-primary h-12 w-full">
                {pending
                  ? "Sending…"
                  : `Submit ${toSubmit.length} ready order${toSubmit.length === 1 ? "" : "s"}`}
              </button>
              {ready.length > toSubmit.length ? (
                <p className="text-xs text-muted-foreground">Up to {MAX_SUBMIT_AT_ONCE} at a time; the rest stay in your cart.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
