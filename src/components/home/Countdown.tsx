"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ticks down to `target`. The first render uses the server's clock
 * (`serverNow`) so the streamed HTML and the hydrated client match; after
 * mount it switches to the browser clock.
 */
export function Countdown({ target, serverNow }: { target: string; serverNow: number }) {
  const end = new Date(target).getTime();
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const { d, h, m, s } = parts(end - now);
  const unit = "ml-0.5 mr-2 text-base font-normal text-white/80 sm:text-lg";
  return (
    <p className="font-semibold tabular-nums text-3xl sm:text-5xl" role="timer" aria-live="off">
      {pad(d)}
      <span className={unit}>d</span>
      {pad(h)}
      <span className={unit}>h</span>
      {pad(m)}
      <span className={unit}>m</span>
      {pad(s)}
      <span className={unit}>s</span>
    </p>
  );
}
