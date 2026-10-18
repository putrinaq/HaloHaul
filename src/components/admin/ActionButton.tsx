"use client";

import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { advanceOrderAction } from "@/app/admin/_actions/orders";
import type { AdminAction } from "@/domain/adminQueue";
import type { OrderStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";
import { OrderDialog } from "./dialogs/OrderDialog";

const CONFIRM_MS = 4000;

/**
 * An order's single primary action. Status changes take two taps (the second
 * within four seconds), so a stray tap on a phone never moves an order;
 * anything that needs input opens its drawer in place.
 */
export function ActionButton({
  orderId,
  status,
  action,
  onDone,
  onStale,
  restrictedReason,
  className,
}: {
  orderId: number;
  status: OrderStatus;
  action: AdminAction;
  onDone: (message: string) => void;
  /** The order changed under us, or the step was refused: the caller refreshes. */
  onStale: (message: string) => void;
  restrictedReason?: string | null;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (action.kind === "dialog") {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={cn("admin-btn-primary group", className)}>
          {action.label}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </button>
        <OrderDialog
          kind={action.dialog}
          orderId={orderId}
          open={open}
          onOpenChange={setOpen}
          restrictedReason={restrictedReason}
          onDone={(message) => {
            setOpen(false);
            onDone(message);
          }}
        />
      </>
    );
  }

  const cancel = () => {
    clearTimeout(timer.current);
    setConfirming(false);
  };

  const onClick = () => {
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
      return;
    }
    cancel();
    startTransition(async () => {
      try {
        const r = await advanceOrderAction({ orderId, expectFrom: status, to: action.to });
        if (r.ok) onDone(r.data.message);
        else onStale(r.error);
      } catch {
        onStale("Couldn't save that. Check your connection and try again.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={cancel}
      onKeyDown={(e) => e.key === "Escape" && cancel()}
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "relative overflow-hidden",
        confirming
          ? "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-black transition-[scale] duration-200 active:scale-[0.98] sm:h-10"
          : "admin-btn-primary",
        className,
      )}
    >
      {pending ? (
        <span aria-hidden className="signin-spinner size-4 rounded-full border-2 border-white/30 border-t-white" />
      ) : confirming ? (
        <Check className="size-4" aria-hidden />
      ) : null}
      <span aria-live="polite">{pending ? "Saving…" : confirming ? "Tap again to confirm" : action.label}</span>
      {confirming ? (
        <span aria-hidden className="admin-confirm-bar absolute inset-x-0 bottom-0 h-0.5 bg-sky-500" style={{ "--confirm-ms": `${CONFIRM_MS}ms` }} />
      ) : null}
    </button>
  );
}
