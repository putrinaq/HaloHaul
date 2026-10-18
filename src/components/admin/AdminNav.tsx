"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, badgeFor, isActive, SETTINGS_NAV, type NavCounts } from "./nav";

/**
 * Desktop sidebar links. Reads the pathname, so the layout renders it inside
 * <Suspense> with <AdminSidebarLinks pathname="" /> as the fallback (same
 * markup, nothing highlighted).
 */
export function AdminSidebarNav({ counts }: { counts: NavCounts }) {
  return <AdminSidebarLinks pathname={usePathname()} counts={counts} />;
}

export function AdminSidebarLinks({ pathname, counts }: { pathname: string; counts: NavCounts }) {
  return (
    <ul className="space-y-1.5">
      {ADMIN_NAV.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        const badge = badgeFor(item, counts);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3.5 rounded-xl px-4 text-[0.94rem] transition-colors duration-200",
                active ? "admin-glow" : "text-white/80 hover:bg-white/6 hover:text-white",
              )}
            >
              <Icon className="size-[1.15rem] shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badge > 0 ? (
                <span className={cn("min-w-6 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums", active ? "bg-white/25 text-white" : "bg-white/10 text-white/80")}>
                  <span className="sr-only">, </span>
                  {badge}
                  <span className="sr-only"> waiting</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Phone bottom bar (Actions, Batches, Payment, Customer, plus More with the
 * rest and Settings). Sits above the home indicator; the layout pads the page
 * so content clears it.
 */
export function AdminMobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const primary = ADMIN_NAV.filter((i) => i.mobile);
  const more = [...ADMIN_NAV.filter((i) => !i.mobile), SETTINGS_NAV];
  const moreActive = more.some((i) => isActive(i, pathname));

  const tab = (active: boolean) =>
    cn(
      "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-[color,scale] duration-200 active:scale-90",
      active ? "text-white" : "text-white/50",
    );

  return (
    <nav aria-label="Admin" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 lg:hidden">
      <ul className="mx-auto flex h-16 max-w-md items-stretch rounded-2xl border border-white/12 bg-neutral-950/90 px-1 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl">
        {primary.map((item) => {
          const active = isActive(item, pathname);
          const Icon = item.icon;
          const badge = badgeFor(item, counts);
          return (
            <li key={item.href} className="flex flex-1">
              <Link href={item.href} aria-current={active ? "page" : undefined} className={tab(active)}>
                <span className="relative">
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.5} aria-hidden />
                  {badge > 0 ? (
                    <span className="absolute -top-1.5 left-3 min-w-4 rounded-full bg-sky-500 px-1 text-center text-[10px] leading-4 font-medium text-white tabular-nums">
                      {badge > 99 ? "99+" : badge}
                      <span className="sr-only"> waiting</span>
                    </span>
                  ) : null}
                </span>
                {item.label}
                {active ? <span aria-hidden className="absolute top-1.5 size-1 rounded-full bg-sky-400" /> : null}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger className={tab(moreActive)}>
              <Ellipsis className="size-5" strokeWidth={moreActive ? 2 : 1.5} aria-hidden />
              More
              {moreActive ? <span aria-hidden className="absolute top-1.5 size-1 rounded-full bg-sky-400" /> : null}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="top"
                align="end"
                sideOffset={12}
                className="z-50 min-w-52 rounded-2xl border border-white/12 bg-neutral-950/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl"
              >
                {more.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item, pathname);
                  return (
                    <DropdownMenu.Item key={item.href} asChild>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-sm outline-none data-highlighted:bg-white/10", active ? "admin-glow" : "text-white/85")}
                      >
                        <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </li>
      </ul>
    </nav>
  );
}
