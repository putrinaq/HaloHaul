import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminMobileNav, AdminSidebarLinks, AdminSidebarNav } from "@/components/admin/AdminNav";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { ToastProvider } from "@/components/admin/Toast";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { getDb } from "@/db/client";
import { navCounts } from "@/server/data/admin";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · HaloHaul Admin" },
  robots: { index: false, follow: false },
  // Installable on the phone as its own app, opening on the Actions board.
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HaloHaul Admin", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#000000" };

/**
 * Everything in the admin console sits behind one gate: until the session is
 * checked, visitors see only a neutral splash, so non-admins never see the
 * console's chrome (they get a 404). Pages still check requireAdmin() in their
 * own data components, because a layout doesn't re-render on client navigation.
 */
export default function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<Splash />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const counts = await navCounts(getDb());

  return (
    <ToastProvider>
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-dvh w-68 shrink-0 flex-col border-r border-white/10 px-5 pt-10 pb-6 lg:flex">
          <Link href="/admin" className="group/logo mx-3 self-start" aria-label="HaloHaul admin — Actions">
            <Logo suffix="ADMIN" className="[&_svg]:h-9" />
          </Link>
          <nav aria-label="Admin" className="mt-14 flex-1 overflow-y-auto">
            <Suspense fallback={<AdminSidebarLinks pathname="" counts={counts} />}>
              <AdminSidebarNav counts={counts} />
            </Suspense>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 lg:justify-end lg:pt-6">
            <Link href="/admin" className="group/logo flex min-h-11 items-center lg:hidden" aria-label="HaloHaul admin — Actions">
              <Logo suffix="ADMIN" />
            </Link>
            <AdminUserMenu name={user.name} email={user.email} />
          </header>
          <main className="flex flex-1 flex-col px-4 pt-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-8 lg:px-10 lg:pt-2 lg:pb-16">{children}</main>
        </div>

        <Suspense fallback={null}>
          <AdminMobileNav counts={counts} />
        </Suspense>
      </div>
    </ToastProvider>
  );
}

function Splash() {
  return (
    <div className="grid flex-1 place-items-center" aria-busy="true">
      <LogoMark className="h-10 animate-pulse text-white/40" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
