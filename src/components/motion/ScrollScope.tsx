"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { releaseScroll, rescanScroll } from "./SmoothScroll";

/**
 * Hands the animated elements inside it to Locomotive once React has hydrated
 * them. Markup uses `data-scroll-defer` (which Locomotive ignores) and this
 * effect swaps it for `data-scroll`: touching server HTML before hydration
 * would cause a mismatch. Put a scope inside each streamed Suspense boundary,
 * since a boundary can hydrate after the scope around it. Effects re-run when
 * a hidden (Cache Components) route is shown again.
 */
export function ScrollScope({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>("[data-scroll-defer]")) {
      // Nested scopes (streamed sections) hand over their own elements.
      if (el.closest("[data-scroll-scope]") !== root) continue;
      el.removeAttribute("data-scroll-defer");
      el.setAttribute("data-scroll", "");
    }
    rescanScroll(root);
    return () => releaseScroll(root);
  }, []);

  return (
    <div ref={ref} data-scroll-scope="" className={className}>
      {children}
    </div>
  );
}
