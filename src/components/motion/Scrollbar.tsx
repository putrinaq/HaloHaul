"use client";

import { useEffect, useRef } from "react";
import { scrollToY } from "./SmoothScroll";

/**
 * Slim overlay scrollbar for mouse and trackpad users (the native one is
 * hidden for them in globals.css; touch devices keep theirs). It shows while
 * the page scrolls or the pointer is over it, the thumb can be dragged, and
 * clicking the track jumps there. Purely visual for assistive tech: keyboard
 * and wheel scrolling are unchanged.
 */
export function Scrollbar() {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb || !window.matchMedia("(pointer: fine) and (hover: hover)").matches) return;

    const root = document.documentElement;
    let thumbHeight = 0;
    let maxScroll = 0;
    let maxTop = 0;
    let frame = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let drag: { startY: number; startScroll: number } | null = null;

    const place = () => {
      frame = 0;
      const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
      thumb.style.transform = `translate3d(0, ${progress * maxTop}px, 0)`;
    };
    const measure = () => {
      const viewport = window.innerHeight;
      maxScroll = root.scrollHeight - viewport;
      thumbHeight = Math.max(48, (viewport * viewport) / root.scrollHeight);
      maxTop = viewport - thumbHeight;
      thumb.style.height = `${thumbHeight}px`;
      track.hidden = maxScroll <= 1;
      place();
    };
    const wake = () => {
      track.dataset.active = "";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!drag) delete track.dataset.active;
      }, 1000);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(place);
      wake();
    };
    const onThumbDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      thumb.setPointerCapture(e.pointerId);
      drag = { startY: e.clientY, startScroll: window.scrollY };
      track.dataset.dragging = "";
      root.classList.add("select-none");
    };
    const onThumbMove = (e: PointerEvent) => {
      if (!drag || maxTop <= 0) return;
      scrollToY(drag.startScroll + ((e.clientY - drag.startY) * maxScroll) / maxTop, { immediate: true });
    };
    const onThumbUp = () => {
      drag = null;
      delete track.dataset.dragging;
      root.classList.remove("select-none");
      wake();
    };
    const onTrackDown = (e: PointerEvent) => {
      if (e.button !== 0 || maxTop <= 0) return;
      // Centre the thumb on the click.
      scrollToY(((e.clientY - thumbHeight / 2) / maxTop) * maxScroll);
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    thumb.addEventListener("pointerdown", onThumbDown);
    thumb.addEventListener("pointermove", onThumbMove);
    thumb.addEventListener("pointerup", onThumbUp);
    thumb.addEventListener("pointercancel", onThumbUp);
    track.addEventListener("pointerdown", onTrackDown);

    return () => {
      resize.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      thumb.removeEventListener("pointerdown", onThumbDown);
      thumb.removeEventListener("pointermove", onThumbMove);
      thumb.removeEventListener("pointerup", onThumbUp);
      thumb.removeEventListener("pointercancel", onThumbUp);
      track.removeEventListener("pointerdown", onTrackDown);
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
      root.classList.remove("select-none");
    };
  }, []);

  return (
    <div
      ref={trackRef}
      aria-hidden
      hidden
      className="group fixed inset-y-0 right-0 z-90 w-3.5 opacity-0 transition-opacity duration-500 hover:opacity-100 data-active:opacity-100 data-dragging:opacity-100 pointer-coarse:hidden"
    >
      <div
        ref={thumbRef}
        className="absolute top-0 right-1 w-1 rounded-full bg-white/35 transition-[width,background-color] duration-300 group-hover:w-1.5 group-hover:bg-white/60 group-data-dragging:w-1.5 group-data-dragging:bg-white/80"
      />
    </div>
  );
}
