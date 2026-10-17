import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { HeaderShell } from "./HeaderShell";
import { NavUser } from "./NavUser";

const links: { href: string; label: string; className?: string }[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/shipping", label: "Shipping" },
  // From lg only: at md widths the pill would be too tight with three links.
  { href: "/catalogue", label: "Catalogue", className: "hidden lg:inline" },
];

/**
 * Floating glass nav from the home design. `overlay` sits on top of the hero.
 * On phones the bottom tab bar (MobileTabBar) carries Shipping, Orders,
 * Account and the order button, so the pill keeps only the logo, How it works
 * and Sign In, each with a 44px tap target.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <HeaderShell overlay={overlay}>
      <div className="mx-auto max-w-6xl px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 sm:pt-6">
        <nav className="glass nav-pill-intro flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 transition-[background-color,box-shadow] duration-500 group-data-scrolled/header:bg-black/55 group-data-scrolled/header:shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_40px_-12px_rgb(0_0_0/0.8)] group-data-scrolled/header:backdrop-blur-xl sm:gap-6 sm:py-3 sm:pr-2 sm:pl-8">
          <Link
            href="/"
            className="nav-item-intro group/logo flex min-h-11 shrink-0 items-center"
            style={{ "--d": 0 }}
          >
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-white/90 md:flex">
            {links.map((l, i) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn("nav-item-intro link-underline text-base transition-colors hover:text-white", l.className)}
                style={{ "--d": i + 1 }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-4">
            <Link
              href="/how-it-works"
              className="nav-item-intro flex min-h-11 items-center px-2 text-sm text-white/80 active:text-white md:hidden"
              style={{ "--d": 1 }}
            >
              How it works
            </Link>
            <div className="nav-item-intro" style={{ "--d": 3 }}>
              <Suspense fallback={<span className="block w-16" />}>
                <NavUser />
              </Suspense>
            </div>
            <Link
              href="/order/new"
              className="glass nav-item-intro hidden rounded-full px-6 py-2.5 text-base whitespace-nowrap transition-colors duration-300 hover:border-white hover:bg-white hover:text-black md:inline-flex"
              style={{ "--d": 4 }}
            >
              Place an order
            </Link>
          </div>
        </nav>
      </div>
    </HeaderShell>
  );
}
