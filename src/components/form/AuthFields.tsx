"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { PASSWORD_MAX, PASSWORD_MIN, passwordStrength } from "@/domain/sanitize";
import { cn } from "@/lib/utils";

// Fields shared by the student and the admin sign-in forms.

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

export function Field({ name, label, icon, error, onClean, onFieldError, onValue, ...props }: FieldProps) {
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

export function PasswordField({
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
