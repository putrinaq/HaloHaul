import { cn } from "@/lib/utils";

/** Box with a halo — the HaloHaul mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 36" fill="none" aria-hidden className={cn("h-7 w-auto", className)}>
      {/* The halo lifts when a parent marked group/logo is hovered (the header link). */}
      <ellipse
        cx="16"
        cy="3.5"
        rx="7.5"
        ry="2"
        stroke="currentColor"
        strokeWidth="1.8"
        className="transition-transform duration-500 ease-(--ease-out-expo) group-hover/logo:-translate-y-0.5"
      />
      <path
        d="M16 9 28 15.5v13L16 35 4 28.5v-13L16 9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 15.5 16 22l12-6.5M16 22v13" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m10 12.3 12 6.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** The styled wordmark ("Halō Haul") — in plain text it's always "HaloHaul". */
export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-white", className)} aria-label="HaloHaul">
      <LogoMark />
      <span aria-hidden className="flex flex-col leading-none">
        <span className="text-xl font-semibold tracking-tight">Halō Haul</span>
        {suffix ? <span className="self-end text-xs font-bold tracking-wider text-sky-400">{suffix}</span> : null}
      </span>
    </span>
  );
}
