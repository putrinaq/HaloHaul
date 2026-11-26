"use client";

import { ArrowRight, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Field, PasswordField } from "@/components/form/AuthFields";
import {
  EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MIN,
  checkPassword,
  cleanEmail,
  cleanName,
} from "@/domain/sanitize";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safeNext";
import { cn } from "@/lib/utils";

type Mode = "password" | "signup";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const MODES: { id: Mode; label: string; title: string; lede: string }[] = [
  { id: "password", label: "Sign in", title: "Welcome back", lede: "Sign in with your email and password." },
  { id: "signup", label: "New account", title: "Create your account", lede: "It takes less than a minute." },
];

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
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields: (keyof Errors)[] = mode === "password" ? ["email", "password"] : ["name", "email", "password"];
    const { ok, values, bot } = validate(e.currentTarget, fields);
    if (!ok || bot) return;
    setEmail(values.email!);

    if (mode === "password") {
      return void run(async () => {
        const { error } = await authClient.signIn.email({ email: values.email!, password: values.password! });
        if (error) return friendly(error, "We couldn't sign you in. Try again.");
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

  // Both panels stay mounted in one grid cell, with only the active one
  // visible. The card is therefore always as tall as the taller panel, so
  // switching tabs never moves the page. The inactive one is `inert`: not
  // focusable, not autofilled, not announced.
  const stack = "col-start-1 row-start-1";

  return (
    <div>
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

              <PasswordField
                label={id === "signup" ? `Password (at least ${PASSWORD_MIN} characters)` : "Password"}
                autoComplete={id === "signup" ? "new-password" : "current-password"}
                error={active ? errors.password : undefined}
                showStrength={id === "signup"}
              />

              <SubmitButton busy={active && busy}>{id === "password" ? "Sign in" : "Create account"}</SubmitButton>

              {/* Reserved line so an error doesn't push the layout around. */}
              <div role="alert" aria-live="assertive" className="-mt-1 min-h-5 text-center text-sm text-destructive">
                {active ? formError : null}
              </div>

              {/* Pinned to the bottom so both tabs end at the same place. */}
              <p className="mt-auto pt-2 text-center text-xs leading-relaxed text-white/55">
                {id === "password" ? (
                  <>
                    New here?{" "}
                    <button type="button" onClick={() => switchMode("signup")} className="link-underline tap-area text-white/85">
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    By creating an account you agree to our{" "}
                    <Link href="/terms" className="link-underline tap-area text-white/85">
                      Terms &amp; Conditions
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="link-underline tap-area text-white/85">
                      Privacy Policy
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
      aria-label="Sign in or create an account"
      onKeyDown={onKeyDown}
      className="relative mt-6 grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-lg bg-white shadow-[0_4px_20px_-6px_rgb(255_255_255/0.5)] transition-transform duration-500 ease-(--ease-out-expo) motion-reduce:transition-none"
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
