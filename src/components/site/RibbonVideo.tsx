"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The light-ribbon background loop (16 s, ~550 KB WebM / ~710 KB MP4, encoded
 * from design/photos with no audio). The 9 KB poster paints immediately; the
 * video only plays when motion is allowed and the visitor isn't on Data
 * Saver, and it pauses whenever it's off-screen or the tab is hidden.
 */
export function RibbonVideo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduceMotion || saveData) return; // the poster stays

    let onScreen = false;
    const sync = () => {
      if (onScreen && !document.hidden) video.play().catch(() => {}); // autoplay can be refused; poster remains
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 overflow-hidden mask-[linear-gradient(to_bottom,transparent,#000_12%,#000_60%,transparent)]",
        className,
      )}
    >
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        poster="/images/ribbon-poster.webp"
        // Narrow screens crop the sides; frame the colourful right half there.
        className="absolute inset-0 size-full object-cover object-[78%_20%] sm:object-[50%_20%]"
      >
        <source src="/videos/ribbon.webm" type="video/webm" />
        <source src="/videos/ribbon.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
