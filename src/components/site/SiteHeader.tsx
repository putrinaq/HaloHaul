import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { NavUser } from "./NavUser";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/shipping", label: "Shipping" },
];

/** Floating glass nav from the home design. `overlay` sits on top of the hero. */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-30" : "relative z-30"}>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <nav className="glass flex items-center gap-3 rounded-full py-2 pr-2 pl-5 sm:gap-6 sm:py-3 sm:pl-8">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-white/90 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-base hover:text-white">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <Suspense fallback={<span className="hidden w-16 sm:block" />}>
              <NavUser />
            </Suspense>
            <Link
              href="/order/new"
              className="glass glass-hover rounded-full px-4 py-2 text-sm whitespace-nowrap sm:px-6 sm:py-2.5 sm:text-base"
            >
              Place an order
            </Link>
          </div>
        </nav>
        <div className="mt-2 flex justify-center gap-5 text-sm text-white/80 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
