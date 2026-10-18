"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Turning 2FA off needs the password again. Where 2FA is required, the next page sends you back to set it up. */
export function DisableTwoFactor() {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className="admin-btn-secondary mt-4" onClick={() => setOpen(true)}>
        Turn off or reset
      </button>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <label htmlFor={id} className="block text-sm font-medium text-white/85">
        Confirm your password
      </label>
      <input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="admin-input" />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className="admin-btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="admin-btn-danger"
          disabled={busy || !password}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const { error } = await authClient.twoFactor.disable({ password });
            setBusy(false);
            if (error) return setError(error.code === "INVALID_PASSWORD" ? "That password isn't right." : "Couldn't turn it off. Try again.");
            router.refresh();
          }}
        >
          Turn off two-factor
        </button>
      </div>
      <p className="text-xs text-white/45">To move to a new phone, turn it off here and set it up again.</p>
    </div>
  );
}
