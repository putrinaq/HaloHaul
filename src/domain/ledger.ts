import { sumMinor, type Sen } from "./money";

export interface Balance {
  /** Positive = the student owes this; negative = credit in the student's favour. */
  balanceSen: Sen;
  owedSen: Sen;
  creditSen: Sen;
}

/** Ledger entries are signed: positive = owed by the student, negative = credit. */
export function balanceOf(entries: ReadonlyArray<{ amountSen: number }>): Balance {
  const balanceSen = sumMinor(entries.map((e) => e.amountSen));
  return {
    balanceSen,
    owedSen: Math.max(0, balanceSen),
    creditSen: Math.max(0, -balanceSen),
  };
}
