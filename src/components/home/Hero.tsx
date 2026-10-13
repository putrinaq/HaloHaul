import Link from "next/link";
import { PLATFORM_LABELS } from "@/domain/labels";
import { SUPPORTED_PLATFORMS } from "@/domain/links";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[92svh] items-end overflow-hidden pt-36 pb-16 sm:items-center sm:pb-24">
      <picture className="absolute inset-0 -z-20">
        <source media="(max-width: 640px)" srcSet="/images/hero-mobile.webp" />
        <img src="/images/hero.webp" alt="" className="size-full object-cover object-center" fetchPriority="high" />
      </picture>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/10 to-black" />

      <div className="mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
        <h1 className="display text-5xl leading-[1.02] text-white sm:text-7xl">
          Your personal buyer
          <br />
          across China&apos;s platforms.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-white/90 sm:text-lg">
          Send us a link or describe what you want. We verify the seller, handle the purchase, coordinate
          international forwarding, and deliver to Malaysia — with every fee broken down before you pay a single
          ringgit.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/order/new" className="glass glass-hover rounded-xl px-6 py-3 text-base">
            Start an Order
          </Link>
          <Link href="/how-it-works" className="glass glass-hover rounded-xl px-6 py-3 text-base">
            How it works
          </Link>
        </div>
        <p className="mt-4 text-sm text-white/80">Every fee shown upfront · Nothing purchased without your approval</p>
        <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-lg text-white/90 sm:text-2xl">
          {SUPPORTED_PLATFORMS.map((p) => (
            <li key={p}>{PLATFORM_LABELS[p]}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
