"use client";

import { useCallback, useEffect, useEffectEvent, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

// Helpers shared by the admin drawers: run a server action with pending/error
// state, load a drawer's data when it opens, and parse money/size inputs.

/** Props every order drawer takes. `onDone` gets the toast message. */
export interface DialogProps {
  orderId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
}

export type Result<T> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(<T,>(call: () => Promise<Result<T>>, onOk: (data: T, message?: string) => void) => {
    setError(null);
    setFieldErrors({});
    start(async () => {
      try {
        const r = await call();
        if (r.ok) onOk(r.data, r.message);
        else {
          setError(r.error);
          setFieldErrors(r.fieldErrors ?? {});
        }
      } catch {
        setError("Couldn't save that. Check your connection and try again.");
      }
    });
  }, []);

  return { pending, error, fieldErrors, run, setError };
}

/**
 * Loads a drawer's data. Use it inside the drawer's body: Radix unmounts a
 * closed drawer's content, so the body mounts (and loads) on every open.
 */
export function useLoaded<T>(load: () => Promise<Result<T>>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const doLoad = useEffectEvent(load);

  useEffect(() => {
    let cancelled = false;
    doLoad()
      .then((r) => {
        if (!cancelled) setState(r.ok ? { data: r.data, error: null, loading: false } : { data: null, error: r.error, loading: false });
      })
      .catch(() => !cancelled && setState({ data: null, error: "Couldn't load this. Try again.", loading: false }));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    ...state,
    reload: () => {
      setState((s) => ({ ...s, loading: true }));
      setTick((t) => t + 1);
    },
  };
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** The drawer's action bar, stuck to the bottom of its scroll area (thumb reach on phones). */
export function DrawerActions({ onCancel, children, cancelLabel = "Cancel" }: { onCancel?: () => void; children?: React.ReactNode; cancelLabel?: string }) {
  return (
    <div className="sticky -bottom-5 z-10 -mx-5 mt-6 flex flex-col-reverse gap-2 border-t border-white/10 bg-neutral-950/95 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-6 sm:flex-row sm:justify-end sm:px-6">
      {onCancel ? (
        <button type="button" onClick={onCancel} className="admin-btn-secondary">
          {cancelLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function ErrorNote({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive", className)}>
      {message}
    </p>
  );
}

// ---- money and sizes ---------------------------------------------------------------

/** "12.50" → 1250 (sen or fen); null when blank; NaN when invalid. */
export function parseMinor(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!s) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export const minorToInput = (v: number | null | undefined) => (v === null || v === undefined ? "" : (v / 100).toFixed(2));

/** kg text → grams; cm text → millimetres (rounded). */
export function parseScaled(input: string, factor: number): number | null {
  const s = input.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * factor) : NaN;
}

export const scaledToInput = (v: number | null | undefined, factor: number) => (v === null || v === undefined ? "" : String(v / factor));

export function MoneyInput({
  id,
  value,
  onChange,
  currency,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  currency: "RM" | "¥";
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-white/45">{currency}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        placeholder="0.00"
        className="admin-input pl-9 tabular-nums"
      />
    </div>
  );
}
