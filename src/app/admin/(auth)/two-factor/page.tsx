import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyTwoFactor } from "./VerifyTwoFactor";

export const metadata: Metadata = { title: "Two-factor code" };

/**
 * Reached right after a password sign-in for an account with 2FA on. There's
 * no session yet (only Better Auth's short-lived two-factor cookie), so this
 * page has nothing to gate; the verify call fails without that cookie.
 */
export default function TwoFactorPage() {
  return (
    <Suspense fallback={<div className="h-72" />}>
      <VerifyTwoFactor />
    </Suspense>
  );
}
