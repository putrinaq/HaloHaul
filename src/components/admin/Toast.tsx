"use client";

import { CircleCheckBig, TriangleAlert } from "lucide-react";
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; tone: "ok" | "warn" };
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

/** One toast at a time for the admin console, announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: string, tone: Toast["tone"] = "ok") => setToast({ id: ++seq.current, text, tone }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex justify-center lg:bottom-8">
        {toast ? (
          <p
            key={toast.id}
            className={cn(
              "admin-toast-in flex items-center gap-2 rounded-full border bg-neutral-950/95 px-4 py-2.5 text-sm shadow-[0_12px_40px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl",
              toast.tone === "ok" ? "border-white/15 text-white" : "border-warning/40 text-warning",
            )}
          >
            {toast.tone === "ok" ? <CircleCheckBig className="size-4 text-success" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {toast.text}
          </p>
        ) : null}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  return use(ToastContext);
}
