"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps the floating nav on screen: it slides away while you scroll down and
 * comes back as soon as you scroll up. `data-scrolled` deepens the glass once
 * the page has moved, so the nav stays legible over content.
 */
export function HeaderShell({ overlay, children }: { overlay: boolean; children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 24);
      // Ignore jitter; never hide near the top.
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 160);
        last = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    // The nav entrance (globals.css) has finished by now; don't replay it.
    const seen = setTimeout(() => document.documentElement.classList.add("nav-seen"), 1600);
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(seen);
    };
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      // Keyboard users tabbing into a hidden nav get it back.
      onFocus={() => setHidden(false)}
      className={cn(
        "group/header inset-x-0 top-0 z-40 transition-transform duration-500 ease-(--ease-out-expo) motion-reduce:transition-none",
        overlay ? "fixed" : "sticky",
        hidden && "translate-y-[-130%]",
      )}
    >
      {children}
    </header>
  );
}
