"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * One field for a 6-digit authenticator code (or a backup code). A single
 * input rather than six boxes, so paste, autofill (`one-time-code`) and screen
 * readers all just work.
 */
export function CodeField({
  value,
  onChange,
  backup = false,
  error,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  backup?: boolean;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white/85">
        {backup ? "Backup code" : "6-digit code"}
      </label>
      <input
        id={id}
        name="code"
        value={value}
        onChange={(e) =>
          onChange(backup ? e.target.value.replace(/\s/g, "").slice(0, 32) : e.target.value.replace(/\D/g, "").slice(0, 6))
        }
        inputMode={backup ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        required
        placeholder={backup ? "xxxxx-xxxxx" : "000000"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "h-14 w-full rounded-xl border border-white/12 bg-white/5 px-4 text-center font-mono text-2xl text-white tabular-nums outline-none placeholder:text-white/20 focus:border-white/50 focus:bg-white/8 aria-invalid:border-destructive/70",
          !backup && "tracking-[0.5em]",
        )}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function twoFactorError(error: { status?: number; code?: string; message?: string }): string {
  if (error.status === 429) return "Too many attempts. Give it a minute, then try again.";
  switch (error.code) {
    case "INVALID_CODE":
    case "INVALID_BACKUP_CODE":
      return "That code didn't work. Codes change every 30 seconds — use the current one.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "Your sign-in timed out. Sign in again.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many wrong codes. Wait a while, then sign in again.";
    case "INVALID_PASSWORD":
      return "That password isn't right.";
  }
  return "Something went wrong. Try again.";
}
