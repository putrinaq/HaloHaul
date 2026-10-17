import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Eyebrow, masked serif title, optional lede and action, then a drawn rule. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  action,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-8 sm:mb-10", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p data-scroll-defer className="eyebrow reveal">
            {eyebrow}
          </p>
          <h2 data-scroll-defer className="display line-mask mt-3 text-4xl leading-[1.05] sm:text-6xl" style={{ "--d": 1 }}>
            <span>{title}</span>
          </h2>
        </div>
        {action ? (
          <div data-scroll-defer className="reveal shrink-0 sm:pb-2" style={{ "--d": 2 }}>
            {action}
          </div>
        ) : null}
      </div>
      {lede ? (
        <p data-scroll-defer className="reveal mt-4 max-w-xl text-base text-white/65 sm:text-lg" style={{ "--d": 2 }}>
          {lede}
        </p>
      ) : null}
      <div data-scroll-defer className="reveal-line mt-6 h-px bg-white/15" />
    </header>
  );
}
