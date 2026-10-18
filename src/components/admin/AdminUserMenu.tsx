"use client";

import { ChevronDown, LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { authClient } from "@/lib/auth-client";

const item = "flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm text-white/85 outline-none data-highlighted:bg-white/10";

/** "Hi Admin!" pill from the design: Settings, Profile/2FA, Sign out. */
export function AdminUserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const first = name.trim().split(/\s+/)[0] || "Admin";

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="group flex h-11 items-center gap-2.5 rounded-full border border-white/20 bg-white/5 py-1 pr-3 pl-1 text-sm text-white transition-colors hover:border-white/40 data-[state=open]:border-white/40 sm:h-10">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-linear-to-br from-white to-neutral-400 text-sm font-semibold text-black">
          {first[0]?.toUpperCase()}
        </span>
        <span>Hi {first}!</span>
        <ChevronDown className="size-4 text-white/60 transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-56 rounded-2xl border border-white/12 bg-neutral-950/95 p-1.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-white">{name}</p>
            <p className="truncate text-xs text-white/55">{email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
          <DropdownMenu.Item asChild>
            <Link href="/admin/settings" className={item}>
              <Settings className="size-4" aria-hidden />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/admin/profile" className={item}>
              <ShieldCheck className="size-4" aria-hidden />
              Profile &amp; 2FA
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
          <DropdownMenu.Item
            onSelect={async () => {
              await authClient.signOut();
              router.push("/sign-in");
              router.refresh();
            }}
            className={`${item} cursor-pointer`}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
