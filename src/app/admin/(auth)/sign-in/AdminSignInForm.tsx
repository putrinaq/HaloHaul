"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, PasswordField } from "@/components/form/AuthFields";
import { EMAIL_MAX, checkPassword, cleanEmail } from "@/domain/sanitize";
import { authClient } from "@/lib/auth-client";
import { ADMIN_PORTAL_HEADER } from "@/lib/authPortal";

/** Password only: no sign-up and no email links, which would skip two-factor. */
export function AdminSignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    const email = cleanEmail(data.get("email"));
    const password = checkPassword(data.get("password"), { forSignUp: false });
    setErrors({ email: email.ok ? undefined : email.error, password: password.ok ? undefined : password.error });
    setFormError(null);
    if (!email.ok || !password.ok) return;

    setBusy(true);
    try {
      const { data: result, error } = await authClient.signIn.email(
        { email: email.value, password: password.value },
        { headers: { [ADMIN_PORTAL_HEADER]: "1" } },
      );
      if (error) {
        setFormError(
          error.status === 429
            ? "Too many attempts. Give it a minute, then try again."
            : error.code === "INVALID_EMAIL_OR_PASSWORD"
              ? "That email and password don't match an admin account."
              : "We couldn't sign you in. Try again.",
        );
        setBusy(false);
        return;
      }
      if (result && "twoFactorRedirect" in result && result.twoFactorRedirect) {
        router.push(`/admin/two-factor?next=${encodeURIComponent(next)}`);
        return;
      }
      // Without 2FA yet, the console sends them on to set it up.
      router.replace(next);
      router.refresh();
    } catch {
      setFormError("Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="display text-3xl sm:text-4xl">Admin sign in</h1>
        <p className="mt-1.5 text-sm text-white/65">Your admin email and password, then your authenticator code.</p>
      </div>

      <Field
        name="email"
        label="Email"
        type="email"
        icon={<Mail className="size-4" aria-hidden />}
        error={errors.email}
        onClean={cleanEmail}
        onFieldError={(email) => setErrors((p) => ({ ...p, email }))}
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={EMAIL_MAX}
      />
      <PasswordField label="Password" autoComplete="current-password" error={errors.password} showStrength={false} />

      <button type="submit" disabled={busy} className="admin-btn-primary w-full sm:h-11">
        {busy ? "One moment…" : "Sign in"}
      </button>

      <div role="alert" aria-live="assertive" className="-mt-1 min-h-5 text-center text-sm text-destructive">
        {formError}
      </div>

      <p className="text-center text-sm text-white/55">
        Looking for your orders?{" "}
        <Link href="/sign-in" className="link-underline tap-area text-white/85">
          Student sign in
        </Link>
      </p>
    </form>
  );
}
