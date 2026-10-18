"use client";

import { CircleUserRound, House, Package, Plus, Ship } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/shipping", label: "Shipping", icon: Ship, match: (p: string) => p.startsWith("/shipping") },
  { href: "/order/new", label: "Order", icon: Plus, match: () => false, primary: true },
  { href: "/orders", label: "Orders", icon: Package, match: (p: string) => p.startsWith("/orders") },
  { href: "/account", label: "Account", icon: CircleUserRound, match: (p: string) => p.startsWith("/account") },
] as const;

/** Focused flows get the whole screen (the order form has its own sticky actions); the admin has its own bar. */
const HIDDEN_ON = ["/order/new", "/sign-in", "/admin"];

/**
 * App-style bottom navigation for phones (hidden from md up, where the header
 * has room). It sits above the home indicator, steps aside while the on-screen
 * keyboard is open, and reserves its own space at the end of the page so it
 * never covers the footer. Rendered inside <Suspense> in the root layout,
 * because reading the pathname would otherwise block prerendering.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      {/* Spacer so the last content scrolls clear of the bar. */}
      <div aria-hidden className="h-[calc(5.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 transition-[translate,opacity] duration-300 ease-(--ease-out-expo) md:hidden",
          keyboardOpen && "pointer-events-none translate-y-[150%] opacity-0",
        )}
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch rounded-2xl border border-white/12 bg-neutral-950/90 px-1 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.match(pathname);
            if ("primary" in tab) {
              return (
                <li key={tab.href} className="flex flex-1 items-center justify-center">
                  <Link
                    href={tab.href}
                    aria-label="Start an order"
                    className="grid size-12 place-items-center rounded-xl bg-white text-black shadow-[0_6px_24px_-6px_rgb(255_255_255/0.45)] transition-transform duration-200 active:scale-90"
                  >
                    <Icon className="size-5" strokeWidth={2.5} aria-hidden />
                  </Link>
                </li>
              );
            }
            return (
              <li key={tab.href} className="flex flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-[color,scale] duration-200 active:scale-90",
                    active ? "text-white" : "text-white/50",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {tab.label}
                  {active ? <span aria-hidden className="absolute top-1.5 size-1 rounded-full bg-brand" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** True while the on-screen keyboard covers part of the layout viewport. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);
  return open;
}
