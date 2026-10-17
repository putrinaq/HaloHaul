import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLATFORM_LABELS } from "@/domain/labels";
import { SUPPORTED_PLATFORMS } from "@/domain/links";

export function Hero() {
  return (
    // Content is centred, so spare height on tall phones splits evenly above and
    // below instead of piling up over the headline. The bottom padding below md
    // keeps it clear of the mobile tab bar.
    <section className="relative isolate flex min-h-svh items-center overflow-hidden pt-28 pb-28 sm:pt-36 md:pb-28">
      {/* Parallax: the photo travels slower than the page. */}
      <div data-scroll-defer data-scroll-speed="-0.3" className="absolute inset-0 -z-20">
        <picture className="block size-full">
          <source media="(max-width: 640px)" srcSet="/images/hero-mobile.webp" />
          <img
            src="/images/hero.webp"
            alt=""
            className="intro-zoom size-full object-cover object-center"
            fetchPriority="high"
          />
        </picture>
      </div>
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-black/45 via-black/10 to-black" />

      <div data-scroll-defer data-scroll-css-progress className="hero-exit mx-auto flex max-w-5xl flex-col items-center px-4 text-center">
        <p className="eyebrow intro-fade" style={{ "--d": 0 }}>
          China → Malaysia, handled for you
        </p>
        <h1 className="display mt-4 text-[2.75rem] leading-[1.02] sm:mt-5 text-white sm:text-7xl lg:text-[5.5rem]">
          <span className="line-mask">
            <span className="intro-rise" style={{ "--d": 0 }}>
              Your personal buyer
            </span>
          </span>
          <span className="line-mask">
            <span className="intro-rise" style={{ "--d": 1 }}>
              across China&apos;s platforms.
            </span>
          </span>
        </h1>
        <p className="intro-fade mt-5 max-w-2xl text-[0.9375rem] text-white/85 sm:mt-7 sm:text-lg" style={{ "--d": 1 }}>
          Send us a link or describe what you want. We verify the seller, handle the purchase, coordinate international
          forwarding, and deliver to Malaysia — with every fee broken down before you pay a single ringgit.
        </p>
        <div className="intro-fade mt-7 flex flex-wrap justify-center gap-3 sm:mt-9" style={{ "--d": 2 }}>
          <Link
            href="/order/new"
            className="group flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-medium text-black transition-colors hover:bg-white/85"
          >
            Start an Order
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </Link>
          <Link href="/how-it-works" className="glass glass-hover rounded-xl px-6 py-3 text-base">
            How it works
          </Link>
        </div>
        <p className="intro-fade mt-4 text-sm text-white/65" style={{ "--d": 3 }}>
          Every fee shown upfront · Nothing purchased without your approval
        </p>

        <div className="mt-9 flex flex-col items-center gap-2.5 sm:mt-14 sm:gap-3">
          <p className="eyebrow intro-fade" style={{ "--d": 4 }}>
            We buy from
          </p>
          <ul className="flex max-w-3xl flex-wrap justify-center gap-x-4 gap-y-1 text-[0.9375rem] text-white/80 sm:gap-x-6 sm:gap-y-1.5 sm:text-lg">
            {SUPPORTED_PLATFORMS.map((p, i) => (
              <li key={p} className="intro-fade" style={{ "--d": 5 + i }}>
                {PLATFORM_LABELS[p]}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        aria-hidden
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 text-[10px] tracking-[0.3em] text-white/45 uppercase sm:flex"
      >
        Scroll
        <span className="block h-10 w-px overflow-hidden bg-white/15">
          <span className="scroll-cue block size-full bg-white/80" />
        </span>
      </div>
    </section>
  );
}
