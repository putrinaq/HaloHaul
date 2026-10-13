"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Horizontal snap-scrolling row with the round prev/next buttons from the design. */
export function ScrollRow({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };
  return (
    <div>
      <div
        ref={ref}
        role="list"
        aria-label={label}
        className={cn("scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2", className)}
      >
        {children}
      </div>
      <div className="mt-4 hidden justify-end gap-3 sm:flex">
        {([-1, 1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => scroll(dir)}
            aria-label={dir === -1 ? "Scroll left" : "Scroll right"}
            className="grid size-9 place-items-center rounded-full border border-white/40 text-white/90 transition-colors hover:bg-white/10"
          >
            {dir === -1 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ))}
      </div>
    </div>
  );
}
