/**
 * Normalise a Malaysian mobile number to E.164 (+60…), the format wa.me links
 * need. Accepts "012-345 6789", "+60 12 345 6789", "60123456789", etc.
 * Returns null if it isn't a plausible Malaysian mobile number.
 */
export function normalizeMyMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "");
  let national: string;
  if (/^\+60\d+$/.test(digits)) national = digits.slice(3);
  else if (/^60\d+$/.test(digits)) national = digits.slice(2);
  else if (/^0\d+$/.test(digits)) national = digits.slice(1);
  else return null;
  // Mobile numbers: 1X-XXXXXXX(X) → 9 or 10 digits after the country code.
  if (!/^1\d{8,9}$/.test(national)) return null;
  return `+60${national}`;
}

/** wa.me wants the number without "+". */
export function waMeNumber(e164: string): string {
  return e164.replace(/^\+/, "");
}
