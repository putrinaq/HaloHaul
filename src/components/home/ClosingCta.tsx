import { ArrowRight } from "lucide-react";
import Link from "next/link";

/** Final call to action above the footer, over the meadow photo. */
export function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:pb-20">
      <div
        data-scroll-defer
        className="reveal relative isolate flex flex-col items-center overflow-hidden rounded-3xl px-6 py-20 text-center sm:py-28"
      >
        <div data-scroll-defer data-scroll-speed="-0.08" className="absolute inset-x-0 top-[-20%] -z-20 h-[140%]">
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
          <img src="/images/meadow.webp" alt="" loading="lazy" className="size-full object-cover" />
        </div>
        <div className="absolute inset-0 -z-10 bg-linear-to-b from-black/70 via-black/45 to-black/75" />
        <p data-scroll-defer className="eyebrow reveal" style={{ "--d": 1 }}>
          Ready when you are
        </p>
        <h2 data-scroll-defer className="display line-mask mt-4 text-4xl leading-[1.05] sm:text-6xl" style={{ "--d": 2 }}>
          <span>Tell us what you&apos;re after.</span>
        </h2>
        <p data-scroll-defer className="reveal mt-5 max-w-lg text-base text-white/80 sm:text-lg" style={{ "--d": 3 }}>
          A link, a screenshot or just a description. You&apos;ll get a full quote before anything is bought.
        </p>
        <div data-scroll-defer className="reveal mt-9" style={{ "--d": 4 }}>
          <Link
            href="/order/new"
            className="group flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-medium text-black transition-colors hover:bg-white/85"
          >
            Start an Order
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
