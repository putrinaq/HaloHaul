import type { FulfilmentMethod, LedgerEntryType, PathType } from "./enums";
import type { Sen } from "./money";
import type { Settings } from "./settings";

/**
 * Fee paid up front before any work starts. Reverse search and consultation
 * fees are kept if the student selects nothing, and credited toward the order
 * if they go ahead (see `computeQuote`'s `feeCreditSen`).
 */
export function upfrontFee(
  pathType: PathType,
  settings: Settings,
): { type: LedgerEntryType; amountSen: Sen } | null {
  switch (pathType) {
    case "reverse_search":
      return { type: "reverse_search_fee", amountSen: settings.fees.reverseSearchFeeSen };
    case "consultation":
      return { type: "consultation_fee", amountSen: settings.fees.consultationFeeSen };
    case "url":
    case "digital":
      return null;
  }
}

/**
 * Coordination (service) fee charged on the quote. Charged once per order —
 * an order is one product line, whatever its quantity.
 */
export function coordinationFeeSen(settings: Settings): Sen {
  return settings.fees.coordinationFeeSen;
}

/** Lalamove is +RM3 per person; campus pickup is free. */
export function deliveryFeeSen(method: FulfilmentMethod, settings: Settings): Sen {
  return method === "lalamove" ? settings.fees.lalamoveFeeSen : 0;
}
