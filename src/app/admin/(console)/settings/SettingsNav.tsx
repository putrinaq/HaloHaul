"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections";

/** Horizontal, scrollable section tabs across the Settings pages. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="scrollbar-none -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {SETTINGS_SECTIONS.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link key={s.href} href={s.href} aria-current={active ? "page" : undefined} className={cn("admin-chip")}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
