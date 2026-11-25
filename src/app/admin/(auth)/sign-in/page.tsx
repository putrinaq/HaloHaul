import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safeAdminNext } from "@/lib/safeNext";
import { getSessionUser } from "@/server/session";
import { AdminSignInForm } from "./AdminSignInForm";

export const metadata: Metadata = { title: "Admin sign in" };

export default function AdminSignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  return (
    <Suspense fallback={<div className="h-80" />}>
      <Gate searchParams={searchParams} />
    </Suspense>
  );
}

/** An admin who is already signed in goes straight to the console. */
async function Gate({ searchParams }: { searchParams: PageProps<"/admin/sign-in">["searchParams"] }) {
  const [user, { next }] = await Promise.all([getSessionUser(), searchParams]);
  const to = safeAdminNext(typeof next === "string" ? next : null);
  if (user?.role === "admin") redirect(to);
  return <AdminSignInForm next={to} />;
}
