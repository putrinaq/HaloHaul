// Input cleaning shared by the sign-in form (instant feedback) and the auth
// server hook (the real gate: client checks can be bypassed). React already
// escapes everything it renders; this keeps markup, control characters and
// invisible tricks out of the database in the first place.

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export type Cleaned = { ok: true; value: string } | { ok: false; error: string };

// C0/C1 controls, zero-width and bidi-override characters (used to disguise text).
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

/** Unicode-normalises, strips invisible characters and collapses whitespace. */
export function cleanText(input: unknown): string {
  return String(input ?? "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Letters and combining marks from any script (Malay, Chinese, Tamil…), with
// spaces, apostrophes, hyphens and dots between them. No digits, no symbols,
// so nothing that can form markup, a URL or a script.
const NAME_SHAPE = /^[\p{L}\p{M}]+(?:[ '’.\-][\p{L}\p{M}]*)*$/u;

export function cleanName(input: unknown): Cleaned {
  const value = cleanText(input);
  if (value.length < 2) return { ok: false, error: "Enter your name (at least 2 letters)." };
  if (value.length > NAME_MAX) return { ok: false, error: `Keep your name under ${NAME_MAX} characters.` };
  if (!NAME_SHAPE.test(value)) return { ok: false, error: "Use letters only, plus spaces, apostrophes or hyphens." };
  return { ok: true, value };
}

// Deliberately strict: ASCII local part and domain with a dot-separated TLD.
// Rejects quotes, angle brackets, spaces and other characters that are legal
// in RFC 5322 but only ever show up in abuse.
const EMAIL_SHAPE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function cleanEmail(input: unknown): Cleaned {
  const value = cleanText(input).toLowerCase();
  if (!value) return { ok: false, error: "Enter your email address." };
  if (value.length > EMAIL_MAX || !EMAIL_SHAPE.test(value) || value.includes("..")) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  return { ok: true, value };
}

/** Passwords are never altered (that would change the secret), only bounded. */
export function checkPassword(input: unknown, { forSignUp = false } = {}): Cleaned {
  const value = typeof input === "string" ? input : "";
  if (!value) return { ok: false, error: "Enter your password." };
  if (value.length > PASSWORD_MAX) return { ok: false, error: `Use at most ${PASSWORD_MAX} characters.` };
  if (forSignUp && value.length < PASSWORD_MIN) return { ok: false, error: `Use at least ${PASSWORD_MIN} characters.` };
  if (/[\u0000-\u001F\u007F]/.test(value)) return { ok: false, error: "Your password contains an unsupported character." };
  return { ok: true, value };
}

/** 0–4 rough strength score for the sign-up meter. Guidance only, not a gate. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length < PASSWORD_MIN) return password.length === 0 ? 0 : 1;
  let score = 1;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  if (/^(.)\1+$/.test(password) || /^(?:password|qwerty|123456)/i.test(password)) score = 1;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}
