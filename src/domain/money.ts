// Money is always an integer number of minor units:
//   MYR → sen (1 RM = 100 sen)      RMB → fen (1 CNY = 100 fen)
// Exchange rates are MYR per 1 CNY, held as an integer number of micro-units
// (rate × 1_000_000) so conversion never touches floating point.

export type Sen = number;
export type Fen = number;

/** MYR per CNY, scaled by 1e6. 0.652300 → 652_300. */
export type FxRateMicro = number;

export const FX_SCALE = 1_000_000;
const FX_DECIMALS = 6;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertMinorUnits(value: number, label = "amount"): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer of minor units, got ${value}`);
  }
}

/**
 * Parse a decimal rate string as stored in Postgres numeric(12,6),
 * e.g. "0.6523" or "0.652300". Rejects anything with more than 6 decimals
 * rather than silently rounding a rate.
 */
export function parseFxRate(input: string): FxRateMicro {
  const s = input.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!match) throw new MoneyError(`Invalid FX rate "${input}"`);
  const [, whole, frac = ""] = match;
  if (frac.length > FX_DECIMALS) {
    throw new MoneyError(`FX rate "${input}" has more than ${FX_DECIMALS} decimal places`);
  }
  const micro = Number(whole) * FX_SCALE + Number(frac.padEnd(FX_DECIMALS, "0"));
  if (!Number.isSafeInteger(micro) || micro <= 0) {
    throw new MoneyError(`FX rate "${input}" must be positive`);
  }
  return micro;
}

/** Inverse of parseFxRate, always 6 decimals (matches numeric(12,6)). */
export function formatFxRate(rate: FxRateMicro): string {
  assertMinorUnits(rate, "rate");
  const whole = Math.floor(rate / FX_SCALE);
  const frac = String(rate % FX_SCALE).padStart(FX_DECIMALS, "0");
  return `${whole}.${frac}`;
}

/**
 * Integer division of a / b rounded half away from zero, in BigInt so large
 * intermediate products stay exact.
 */
function divRoundHalfUp(a: bigint, b: bigint): bigint {
  const negative = a < 0n !== b < 0n;
  const absA = a < 0n ? -a : a;
  const absB = b < 0n ? -b : b;
  const q = (absA * 2n + absB) / (absB * 2n);
  return negative ? -q : q;
}

/** fen × (MYR/CNY) → sen. Both are hundredths, so the rate applies directly. */
export function fenToSen(fen: Fen, rate: FxRateMicro): Sen {
  assertMinorUnits(fen, "fen");
  assertMinorUnits(rate, "rate");
  const sen = divRoundHalfUp(BigInt(fen) * BigInt(rate), BigInt(FX_SCALE));
  return Number(sen);
}

/** a × pct / 100, rounded down (towards zero) — used for caps that protect the student. */
export function percentOfFloor(amount: number, pct: number): number {
  assertMinorUnits(amount);
  assertMinorUnits(pct, "pct");
  return Number((BigInt(amount) * BigInt(pct)) / 100n);
}

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertMinorUnits(v);
    total += v;
  }
  assertMinorUnits(total, "total");
  return total;
}

/** RM 1,234.50 — the sign goes before "RM" for credits: "-RM 3.00". */
export function formatMyr(sen: Sen): string {
  assertMinorUnits(sen, "sen");
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100).toLocaleString("en-MY");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}RM ${ringgit}.${cents}`;
}

/** ¥1,234.50 */
export function formatCny(fen: Fen): string {
  assertMinorUnits(fen, "fen");
  const sign = fen < 0 ? "-" : "";
  const abs = Math.abs(fen);
  const yuan = Math.floor(abs / 100).toLocaleString("en-MY");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}¥${yuan}.${cents}`;
}

/** Parse "12.5" / "12.50" / "12" (ringgit or yuan) into minor units. No floats. */
export function parseMajorToMinor(input: string): number {
  const s = input.trim().replace(/,/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) throw new MoneyError(`Invalid amount "${input}"`);
  const [, neg, whole, frac = ""] = match;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  assertMinorUnits(minor);
  return neg ? -minor : minor;
}
