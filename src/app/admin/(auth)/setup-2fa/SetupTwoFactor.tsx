"use client";

import { Check, Copy, Download, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { CodeField, twoFactorError } from "@/components/admin/CodeField";
import { QrCode } from "@/components/admin/QrCode";
import { authClient } from "@/lib/auth-client";

type Enrolment = { totpURI: string; backupCodes: string[] };

/**
 * Two steps: confirm the password (Better Auth requires it to create the
 * secret), then scan the QR code and prove it works with one code. 2FA only
 * switches on after that first code is accepted.
 */
export function SetupTwoFactor({ email }: { email: string }) {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwId = useId();

  async function start(e: FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await authClient.twoFactor.enable({ password });
      if (error || !data || !("totpURI" in data)) setError(twoFactorError(error ?? {}));
      else setEnrolment({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) {
        setError(twoFactorError(error));
        setBusy(false);
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (!enrolment) {
    return (
      <form onSubmit={start} className="space-y-5">
        <Intro />
        <p className="text-sm text-white/65">
          You&apos;ll need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator,
          1Password or Authy. First, confirm your password for <span className="text-white">{email}</span>.
        </p>
        <div>
          <label htmlFor={pwId} className="mb-1.5 block text-sm font-medium text-white/85">
            Password
          </label>
          <input
            id={pwId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            aria-invalid={error ? true : undefined}
            className="h-12 w-full rounded-xl border border-white/12 bg-white/5 px-4 text-base text-white outline-none focus:border-white/50 focus:bg-white/8 aria-invalid:border-destructive/70"
          />
          {error ? (
            <p role="alert" className="mt-1.5 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={busy} className="admin-btn-primary w-full sm:h-11">
          {busy ? "One moment…" : "Continue"}
        </button>
      </form>
    );
  }

  const secret = new URL(enrolment.totpURI).searchParams.get("secret") ?? "";

  return (
    <form onSubmit={verify} className="space-y-6">
      <Intro />

      <Step n={1} title="Scan with your authenticator app">
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <QrCode value={enrolment.totpURI} label="QR code for your authenticator app" className="size-44 shrink-0 rounded-xl" />
          <div className="min-w-0 text-sm text-white/65">
            <p>On this phone? Open the key in your app directly:</p>
            <a href={enrolment.totpURI} className="admin-btn-secondary mt-2 w-full">
              <KeyRound className="size-4" aria-hidden />
              Open in app
            </a>
            <p className="mt-3">Or type this key:</p>
            <CopyText text={secret} display={secret.match(/.{1,4}/g)?.join(" ") ?? secret} label="Copy key" mono />
          </div>
        </div>
      </Step>

      <Step n={2} title="Save your backup codes">
        <p className="mt-1 text-sm text-white/65">Each one gets you in once if you lose your phone. Keep them somewhere safe.</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-sm">
          {enrolment.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <CopyText text={enrolment.backupCodes.join("\n")} label="Copy codes" />
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(
              `HaloHaul admin backup codes for ${email}\nEach code works once.\n\n${enrolment.backupCodes.join("\n")}\n`,
            )}`}
            download="halohaul-backup-codes.txt"
            className="admin-btn-secondary flex-1"
          >
            <Download className="size-4" aria-hidden />
            Download
          </a>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-white/85">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(e) => setSavedCodes(e.target.checked)}
            className="size-4 accent-sky-500"
          />
          I&apos;ve saved my backup codes
        </label>
      </Step>

      <Step n={3} title="Enter the code from the app">
        <div className="mt-3">
          <CodeField value={code} onChange={setCode} error={error} />
        </div>
      </Step>

      <button type="submit" disabled={busy || code.length !== 6 || !savedCodes} className="admin-btn-primary w-full sm:h-11">
        <ShieldCheck className="size-4" aria-hidden />
        {busy ? "Checking…" : "Turn on two-factor"}
      </button>
    </form>
  );
}

function Intro() {
  return (
    <div>
      <h1 className="display text-3xl sm:text-4xl">Secure your admin account</h1>
      <p className="mt-1.5 text-sm text-white/65">The admin area needs a code from your phone as well as your password.</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2.5 font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-white/10 text-xs tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CopyText({ text, display, label, mono }: { text: string; display?: string; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className={display ? "mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-white hover:bg-white/10" : "admin-btn-secondary flex-1"}
    >
      {display ? <span className={mono ? "font-mono text-xs" : undefined}>{display}</span> : null}
      <span className="flex shrink-0 items-center gap-1.5 text-sm">
        {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {display ? <span className="sr-only">{copied ? "Copied" : label}</span> : copied ? "Copied" : label}
      </span>
    </button>
  );
}
