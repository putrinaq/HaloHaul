"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CodeField, twoFactorError } from "@/components/admin/CodeField";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safeNext";

export function VerifyTwoFactor() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/admin");
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = backup ? code.length >= 6 : code.length === 6;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = backup
        ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice });
      if (error) {
        setError(twoFactorError(error));
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="display text-3xl sm:text-4xl">Enter your code</h1>
        <p className="mt-1.5 text-sm text-white/65">
          {backup
            ? "Use one of the backup codes you saved when you set up two-factor. Each works once."
            : "Open your authenticator app and enter the 6-digit code for HaloHaul."}
        </p>
      </div>

      <CodeField key={String(backup)} value={code} onChange={setCode} backup={backup} error={error} autoFocus />

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-white/85">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
          className="size-4 accent-sky-500"
        />
        Trust this device for 30 days
      </label>

      <button type="submit" disabled={busy || !ready} className="admin-btn-primary w-full sm:h-11">
        {busy ? "Checking…" : "Verify"}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setBackup((b) => !b);
            setCode("");
            setError(null);
          }}
          className="link-underline tap-area text-white/70 hover:text-white"
        >
          {backup ? "Use the authenticator app" : "Use a backup code"}
        </button>
        <Link href="/sign-in" className="link-underline tap-area text-white/55 hover:text-white">
          Start over
        </Link>
      </div>
    </form>
  );
}
