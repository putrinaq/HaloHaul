"use client";

import { useEffect, useRef } from "react";

const INTERACTIVE = "a, button, [role='button'], [role='tab'], [role='option'], label, select, summary";
const TEXT_ENTRY =
  "input:not([type='checkbox'], [type='radio'], [type='submit'], [type='button'], [type='range']), textarea, [contenteditable='true']";

/**
 * Custom cursor for mouse users: a dot that tracks the pointer exactly and a
 * ring that trails it. Over links and buttons the ring swells into a solid
 * disc (difference blend, so it inverts what's under it); over text fields
 * it steps aside for the native I-beam. Touch devices never mount it, and the
 * native cursor is only hidden once this is running (`html.has-cursor`).
 */
export function Cursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!root || !dot || !ring || !window.matchMedia("(pointer: fine) and (hover: hover)").matches) return;

    const follow = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0.2;
    const html = document.documentElement;
    html.classList.add("has-cursor");

    let x = -100;
    let y = -100;
    let ringX = x;
    let ringY = y;
    let frame = 0;

    const render = () => {
      ringX += (x - ringX) * follow;
      ringY += (y - ringY) * follow;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
      // Only run while the ring is still catching up.
      frame = Math.abs(x - ringX) + Math.abs(y - ringY) > 0.1 ? requestAnimationFrame(render) : 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };
    const classify = (target: EventTarget | null) => {
      const el = target instanceof Element ? target : null;
      root.dataset.state = el?.closest(TEXT_ENTRY) ? "text" : el?.closest(INTERACTIVE) ? "link" : "";
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      if (!root.dataset.visible) {
        // Appear in place rather than flying in from the corner.
        ringX = x;
        ringY = y;
        root.dataset.visible = "";
      }
      classify(e.target);
      kick();
    };
    const onDown = () => (root.dataset.pressed = "");
    const onUp = () => delete root.dataset.pressed;
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) delete root.dataset.visible;
    };
    // Content moves under a still pointer while scrolling.
    const onScroll = () => {
      if (root.dataset.visible) classify(document.elementFromPoint(x, y));
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("mouseout", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("mouseout", onLeave);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      html.classList.remove("has-cursor");
    };
  }, []);

  return (
    <div ref={rootRef} aria-hidden className="cursor pointer-events-none fixed top-0 left-0 z-100 size-0 mix-blend-difference">
      <div ref={ringRef} className="absolute top-0 left-0">
        <div className="cursor-ring" />
      </div>
      <div ref={dotRef} className="absolute top-0 left-0">
        <div className="cursor-dot" />
      </div>
    </div>
  );
}
