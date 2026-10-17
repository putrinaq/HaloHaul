"use client";

import type LocomotiveScroll from "locomotive-scroll";
import { useEffect } from "react";

// One Locomotive Scroll (Lenis) instance for the whole app, created once in the
// root layout. Pages register their `[data-scroll]` elements through
// <ScrollScope>, because Locomotive only scans the DOM when it starts, and with
// Cache Components hidden routes stay in the document (display: none).

let instance: LocomotiveScroll | null = null;

/**
 * (Re)registers every `[data-scroll]` element inside `root`. Safe to repeat:
 * removing first means an element is never tracked twice, and removal keeps
 * `is-inview`, so anything already revealed stays revealed.
 */
export function rescanScroll(root: HTMLElement) {
  if (!instance) return; // not ready yet: the initial scan will pick `root` up
  instance.removeScrollElements(root);
  instance.addScrollElements(root);
}

export function releaseScroll(root: HTMLElement) {
  instance?.removeScrollElements(root);
}

/** Scrolls the page through Lenis (so its smoothing stays in sync), or natively before it loads. */
export function scrollToY(y: number, { immediate = false } = {}) {
  const jump = immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (instance) instance.scrollTo(y, { immediate: jump, duration: jump ? undefined : 0.9 });
  else window.scrollTo({ top: y, behavior: jump ? "instant" : "smooth" });
}

export function SmoothScroll() {
  useEffect(() => {
    let cancelled = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("locomotive-scroll").then(({ default: Locomotive }) => {
      if (cancelled) return;
      instance = new Locomotive({
        // Reveal once an element is 8% into the viewport, not on its first pixel.
        triggerRootMargin: "0px 0px -8% 0px",
        lenisOptions: {
          // Reduced motion: native wheel scrolling, which also disables parallax.
          smoothWheel: !reduceMotion,
          lerp: 0.11,
          anchors: true,
          stopInertiaOnNavigate: true,
          // Let dropdowns, dialogs and listboxes scroll natively.
          prevent: (node) =>
            node.closest("[data-radix-popper-content-wrapper], [role='dialog'], [role='listbox']") !== null,
          // A Radix overlay has locked the page: don't scroll behind it.
          virtualScroll: () => !document.body.hasAttribute("data-scroll-locked"),
        },
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
      instance = null;
    };
  }, []);

  // No route-change hook here: usePathname() in the root layout would block
  // prerendering, and Lenis' ResizeObserver already tracks content height.
  return null;
}
