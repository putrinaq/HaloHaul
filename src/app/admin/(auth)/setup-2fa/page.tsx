import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/server/session";
import { SetupTwoFactor } from "./SetupTwoFactor";

export const metadata: Metadata = { title: "Set up two-factor" };

export default function SetupTwoFactorPage() {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-white/5" />}>
      <Gate />
    </Suspense>
  );
}

/** Admins only, and only until 2FA is on (then requireAdmin lets them into the console). */
async function Gate() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin") notFound();
  if (user.twoFactorEnabled) redirect("/admin");
  return <SetupTwoFactor email={user.email} />;
}
