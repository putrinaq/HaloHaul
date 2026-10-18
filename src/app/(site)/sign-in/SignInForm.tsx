"use client";

import { ArrowRight, Check, Eye, EyeOff, KeyRound, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  checkPassword,
  cleanEmail,
  cleanName,
  passwordStrength,
} from "@/domain/sanitize";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safeNext";
import { cn } from "@/lib/utils";

type Mode = "link" | "password" | "signup";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const MODES: { id: Mode; label: string; title: string; lede: string }[] = [
  { id: "link", label: "Email link", title: "Sign in", lede: "We'll email you a one-tap sign-in link." },
  { id: "password", label: "Password", title: "Welcome back", lede: "Sign in with your email and password." },
  { id: "signup", label: "New account", title: "Create your account", lede: "It takes less than a minute." },
];

const RESEND_SECONDS = 60;

const LINK_POINTS = ["No password to remember", "Links expire after 10 minutes", "New here? It creates your account too"];

/** Best-effort shortcut to the inbox for common providers. */
function inboxFor(email: string): { label: string; href: string } | null {
  const domain = email.split("@")[1] ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return { label: "Open Gmail", href: "https://mail.google.com/" };
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return { label: "Open Outlook", href: "https://outlook.live.com/mail/" };
  if (domain.startsWith("yahoo.")) return { label: "Open Yahoo Mail", href: "https://mail.yahoo.com/" };
  if (domain === "icloud.com" || domain === "me.com") return { label: "Open iCloud Mail", href: "https://www.icloud.com/mail/" };
  return null;
}

/** Maps auth errors to plain sentences. Rendered as text only, never as HTML. */
function friendly(error: { status?: number; code?: string; message?: string }, fallback: string): string {
  if (error.status === 429) return "Too many attempts. Give it a minute, then try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with that email. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${PASSWORD_MIN} characters.`;
  }
  // Our own server checks return short, plain messages; anything else gets the fallback.
  return error.message && error.message.length <= 120 ? error.message : fallback;
}

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const askedFor = params.get("next");
  const next = safeNext(askedFor);
  /** Admins land in the console unless a page asked for somewhere specific. */
  const adminNext = askedFor ? next : "/admin";

  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError(null);
  };

  /** Runs one request at a time; maps failures to a message. */
  async function run(task: () => Promise<string | null>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const message = await task();
      if (message) setFormError(message);
    } catch {
      setFormError("Something went wrong. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  /** Validates and cleans the form; focuses the first invalid field. */
  function validate(form: HTMLFormElement, fields: (keyof Errors)[]) {
    const data = new FormData(form);
    const found: Errors = {};
    const values: Partial<Record<keyof Errors, string>> = {};
    for (const field of fields) {
      const raw = data.get(field);
      const result =
        field === "email"
          ? cleanEmail(raw)
          : field === "name"
            ? cleanName(raw)
            : checkPassword(raw, { forSignUp: mode === "signup" });
      if (result.ok) values[field] = result.value;
      else found[field] = result.error;
    }
    setErrors(found);
    const firstBad = fields.find((f) => found[f]);
    if (firstBad) (form.elements.namedItem(firstBad) as HTMLInputElement | null)?.focus();
    // Bots fill every field, including the hidden one people never see.
    const bot = String(data.get("company") ?? "") !== "";
    return { ok: !firstBad, values, bot };
  }

  const done = () => {
    router.push(next);
    router.refresh();
  };

  function sendLink(to: string) {
    return run(async () => {
      const { error } = await authClient.signIn.magicLink({ email: to, callbackURL: next });
      if (error) return friendly(error, "We couldn't send the link. Try again.");
      setSentTo(to);
      return null;
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields: (keyof Errors)[] =
      mode === "link" ? ["email"] : mode === "password" ? ["email", "password"] : ["name", "email", "password"];
    const { ok, values, bot } = validate(e.currentTarget, fields);
    if (!ok) return;
    if (bot) {
      if (mode === "link") setSentTo(values.email!);
      return;
    }
    setEmail(values.email!);

    if (mode === "link") return void sendLink(values.email!);
    if (mode === "password") {
      return void run(async () => {
        const { data, error } = await authClient.signIn.email({ email: values.email!, password: values.password! });
        if (error) return friendly(error, "We couldn't sign you in. Try again.");
        if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
          router.push(`/admin/two-factor?next=${encodeURIComponent(adminNext)}`);
          return null;
        }
        const role = data && "user" in data ? (data.user as { role?: string }).role : undefined;
        if (role === "admin") {
          // Without 2FA yet, /admin sends them on to set it up.
          router.push(adminNext);
          router.refresh();
          return null;
        }
        done();
        return null;
      });
    }
    return void run(async () => {
      const { error } = await authClient.signUp.email({
        name: values.name!,
        email: values.email!,
        password: values.password!,
      });
      if (error) return friendly(error, "We couldn't create your account. Try again.");
      done();
      return null;
    });
  }

  // All three panels (and the "check your inbox" screen) stay mounted in one
  // grid cell, with only the active one visible. The card is therefore always
  // as tall as the tallest panel, so switching tabs never moves the page.
  // Inactive layers are `inert`: not focusable, not autofilled, not announced.
  const stack = "col-start-1 row-start-1";

  return (
    <div className="grid">
      <div className={cn(stack, sentTo && "invisible")} inert={sentTo !== null}>
        <div className="grid">
          {MODES.map((m) => (
            <div
              key={m.id}
              aria-hidden={m.id !== mode}
              className={cn(stack, m.id === mode ? "signin-panel-in" : "invisible")}
            >
              <h2 className="display text-3xl sm:text-4xl">{m.title}</h2>
              <p className="mt-1.5 text-sm text-white/65">{m.lede}</p>
            </div>
          ))}
        </div>

        <ModeTabs mode={mode} onChange={switchMode} />

        <div className="mt-6 grid">
          {MODES.map(({ id }) => {
            const active = id === mode;
            return (
              <form
                key={id}
                id={`panel-${id}`}
                role="tabpanel"
                aria-labelledby={`tab-${id}`}
                inert={!active}
                onSubmit={onSubmit}
                noValidate
                className={cn(stack, "flex flex-col gap-4", active ? "signin-panel-in" : "invisible")}
              >
                {/* Honeypot: hidden from people and assistive tech, irresistible to form bots. */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden
                  className="absolute -left-[9999px] size-px opacity-0"
                />

                {id === "signup" ? (
                  <Field
                    name="name"
                    label="Name"
                    icon={<UserRound className="size-4" aria-hidden />}
                    error={active ? errors.name : undefined}
                    onClean={cleanName}
                    onFieldError={(msg) => setErrors((p) => ({ ...p, name: msg }))}
                    autoComplete="name"
                    autoCapitalize="words"
                    maxLength={NAME_MAX}
                    placeholder="Your full name"
                  />
                ) : null}

                {/* Controlled and shared, so the address carries across tabs. */}
                <Field
                  name="email"
                  label="Email"
                  type="email"
                  icon={<Mail className="size-4" aria-hidden />}
                  error={active ? errors.email : undefined}
                  onClean={cleanEmail}
                  onFieldError={(msg) => setErrors((p) => ({ ...p, email: msg }))}
                  value={email}
                  onValue={setEmail}
                  autoComplete={id === "signup" ? "email" : "username"}
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={EMAIL_MAX}
                  placeholder="you@example.com"
                />

                {id !== "link" ? (
                  <PasswordField
                    label={id === "signup" ? `Password (at least ${PASSWORD_MIN} characters)` : "Password"}
                    autoComplete={id === "signup" ? "new-password" : "current-password"}
                    error={active ? errors.password : undefined}
                    showStrength={id === "signup"}
                  />
                ) : null}

                <SubmitButton busy={active && busy}>
                  {id === "link" ? "Email me a sign-in link" : id === "password" ? "Sign in" : "Create account"}
                </SubmitButton>

                {/* Reserved line so an error doesn't push the layout around. */}
                <div role="alert" aria-live="assertive" className="-mt-1 min-h-5 text-center text-sm text-destructive">
                  {active ? formError : null}
                </div>

                {id === "link" ? (
                  <ul className="space-y-3 border-t border-white/10 pt-5 text-sm text-white/70">
                    {LINK_POINTS.map((point) => (
                      <li key={point} className="flex items-center gap-3">
                        <Check className="size-4 shrink-0 text-brand" aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* Pinned to the bottom so every tab ends at the same place. */}
                <p className="mt-auto pt-2 text-center text-xs leading-relaxed text-white/55">
                  {id === "link" ? (
                    <>
                      Prefer a password?{" "}
                      <button type="button" onClick={() => switchMode("password")} className="link-underline tap-area text-white/85">
                        Sign in with one
                      </button>
                    </>
                  ) : id === "password" ? (
                    <>
                      Forgot it?{" "}
                      <button type="button" onClick={() => switchMode("link")} className="link-underline tap-area text-white/85">
                        Email me a sign-in link instead
                      </button>
                    </>
                  ) : (
                    <>
                      By creating an account you agree to our{" "}
                      <Link href="/terms" className="link-underline tap-area text-white/85">
                        Terms
                      </Link>{" "}
                      and{" "}
                      <Link href="/terms#privacy" className="link-underline tap-area text-white/85">
                        PDPA notice
                      </Link>
                      .
                    </>
                  )}
                </p>
              </form>
            );
          })}
        </div>
      </div>

      {sentTo ? (
        <div className={cn(stack, "self-center")}>
          <LinkSent
            email={sentTo}
            busy={busy}
            error={formError}
            onResend={() => sendLink(sentTo)}
            onBack={() => setSentTo(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Accessible segmented tabs with a sliding indicator and arrow-key support. */
function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const index = MODES.findIndex((m) => m.id === mode);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? MODES.length - 1 : step ? (index + step + MODES.length) % MODES.length : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(MODES[to].id);
    refs.current[to]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="How to sign in"
      onKeyDown={onKeyDown}
      className="relative mt-6 grid grid-cols-3 rounded-xl border border-white/10 bg-white/5 p-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white shadow-[0_4px_20px_-6px_rgb(255_255_255/0.5)] transition-transform duration-500 ease-(--ease-out-expo) motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {MODES.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`tab-${m.id}`}
          type="button"
          role="tab"
          aria-selected={m.id === mode}
          aria-controls={`panel-${m.id}`}
          tabIndex={m.id === mode ? 0 : -1}
          onClick={() => onChange(m.id)}
          className={cn(
            "relative z-10 min-h-11 rounded-lg text-sm font-medium sm:min-h-0 sm:py-2 transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            m.id === mode ? "text-black" : "text-white/65 hover:text-white",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

type FieldProps = {
  name: "name" | "email";
  label: string;
  icon: ReactNode;
  error?: string;
  /** Cleans the value when the field loses focus and reports a problem early. */
  onClean: (v: unknown) => { ok: true; value: string } | { ok: false; error: string };
  onFieldError: (message: string | undefined) => void;
  /** Receives every change and the cleaned value on blur (for controlled fields). */
  onValue?: (v: string) => void;
} & Omit<React.ComponentProps<"input">, "name" | "onChange" | "onBlur">;

function Field({ name, label, icon, error, onClean, onFieldError, onValue, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white/85">
        {label}
      </label>
      <div className="group relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-white/85">
          {icon}
        </span>
        <input
          id={id}
          name={name}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onBlur={(e) => {
            if (!e.currentTarget.value) return;
            const result = onClean(e.currentTarget.value);
            if (result.ok) {
              e.currentTarget.value = result.value;
              onValue?.(result.value);
            }
            onFieldError(result.ok ? undefined : result.error);
          }}
          onChange={(e) => {
            if (error) onFieldError(undefined);
            onValue?.(e.currentTarget.value);
          }}
          className="h-12 w-full rounded-xl border border-white/12 bg-white/5 pr-4 pl-10 text-base text-white transition-[border-color,background-color,box-shadow] duration-300 outline-none placeholder:text-white/30 hover:border-white/25 focus:border-white/50 focus:bg-white/8 focus:shadow-[0_0_0_4px_rgb(255_255_255/0.06)] aria-invalid:border-destructive/70"
          {...props}
        />
      </div>
      <FieldMessage id={errorId} message={error} />
    </div>
  );
}

function PasswordField({
  label,
  autoComplete,
  error,
  showStrength,
}: {
  label: string;
  autoComplete: string;
  error?: string;
  showStrength: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [strength, setStrength] = useState<0 | 1 | 2 | 3 | 4>(0);
  const labels = ["", "Too weak", "Okay", "Good", "Strong"];

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white/85">
        {label}
      </label>
      <div className="group relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-white/85">
          <KeyRound className="size-4" aria-hidden />
        </span>
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          maxLength={PASSWORD_MAX}
          minLength={showStrength ? PASSWORD_MIN : undefined}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errorId : "", capsLock ? `${id}-caps` : ""].filter(Boolean).join(" ") || undefined}
          onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
          onBlur={() => setCapsLock(false)}
          onChange={(e) => showStrength && setStrength(passwordStrength(e.currentTarget.value))}
          className="h-12 w-full rounded-xl border border-white/12 bg-white/5 pr-12 pl-10 text-base text-white transition-[border-color,background-color,box-shadow] duration-300 outline-none placeholder:text-white/30 hover:border-white/25 focus:border-white/50 focus:bg-white/8 focus:shadow-[0_0_0_4px_rgb(255_255_255/0.06)] aria-invalid:border-destructive/70"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>

      {showStrength ? (
        <div className="mt-2 flex items-center gap-3" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={cn(
                  "h-1 flex-1 rounded-full bg-white/10 transition-colors duration-300",
                  strength >= n && (strength <= 1 ? "bg-destructive" : strength === 2 ? "bg-warning" : "bg-success"),
                )}
              />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-white/55">{labels[strength]}</span>
        </div>
      ) : null}
      {capsLock ? (
        <p id={`${id}-caps`} className="mt-1.5 text-xs text-warning">
          Caps Lock is on.
        </p>
      ) : null}
      <FieldMessage id={errorId} message={error} />
    </div>
  );
}

function FieldMessage({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="signin-panel-in mt-1.5 text-xs text-destructive">
      {message}
    </p>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="signin-submit group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white text-base font-medium text-black transition-[background-color,transform] duration-300 hover:bg-white/90 active:scale-[0.99] disabled:cursor-wait disabled:bg-white/80"
    >
      {busy ? (
        <span aria-hidden className="signin-spinner size-4 rounded-full border-2 border-black/20 border-t-black" />
      ) : null}
      <span>{busy ? "One moment…" : children}</span>
      {busy ? null : (
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
      )}
    </button>
  );
}

function LinkSent({
  email,
  busy,
  error,
  onResend,
  onBack,
}: {
  email: string;
  busy: boolean;
  error: string | null;
  onResend: () => void;
  onBack: () => void;
}) {
  const [left, setLeft] = useState(RESEND_SECONDS);
  const inbox = inboxFor(email);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  return (
    <div role="status" aria-live="polite" className="signin-panel-in text-center">
      <svg viewBox="0 0 52 52" className="signin-check mx-auto size-16 text-brand" aria-hidden>
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2 className="display mt-5 text-3xl sm:text-4xl">Check your inbox</h2>
      <p className="mt-2 text-sm text-white/70">
        We sent a sign-in link to <span className="font-medium break-all text-white">{email}</span>. It expires in 10
        minutes.
      </p>

      <div className="mt-7 space-y-3">
        {inbox ? (
          <a
            href={inbox.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white font-medium text-black transition-colors hover:bg-white/90"
          >
            {inbox.label}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onResend();
            setLeft(RESEND_SECONDS);
          }}
          disabled={left > 0 || busy}
          className="h-12 w-full rounded-xl border border-white/15 text-sm text-white/85 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:text-white/40 disabled:hover:bg-transparent"
        >
          {busy ? "Sending…" : left > 0 ? `Resend link in ${left}s` : "Resend link"}
        </button>
      </div>

      <div role="alert" className="mt-3 min-h-5 text-sm text-destructive">
        {error}
      </div>

      <button type="button" onClick={onBack} className="link-underline mt-2 text-sm text-white/65 hover:text-white">
        Use a different email
      </button>
    </div>
  );
}
