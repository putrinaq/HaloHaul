import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Panel } from "@/components/admin/ui";
import { adminNeedsTwoFactor, requireAdmin } from "@/server/session";
import { DisableTwoFactor } from "./DisableTwoFactor";

export const metadata: Metadata = { title: "Profile & 2FA" };

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="Profile" />
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-white/5" />}>
        <Profile />
      </Suspense>
    </div>
  );
}

async function Profile() {
  const user = await requireAdmin();
  const required = adminNeedsTwoFactor();
  return (
    <div className="mt-6 space-y-4">
      <Panel title="Account">
        <p className="font-medium">{user.name}</p>
        <p className="text-white/55">{user.email}</p>
      </Panel>
      <Panel title="Two-factor authentication">
        {user.twoFactorEnabled ? (
          <>
            <p className="flex items-center gap-2 text-success">
              <ShieldCheck className="size-4" aria-hidden />
              On — sign-in asks for a code from your authenticator app.
            </p>
            <DisableTwoFactor />
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-warning">
              <ShieldAlert className="size-4" aria-hidden />
              Off.{required ? "" : " It's switched off for this machine (ADMIN_REQUIRE_2FA=false); production always requires it."}
            </p>
            <Link href="/admin/setup-2fa" className="admin-btn-primary mt-4">
              Set up two-factor
            </Link>
          </>
        )}
      </Panel>
    </div>
  );
}
