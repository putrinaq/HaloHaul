import type { ShippingMode } from "./enums";
import type { FxRateMicro, Sen } from "./money";
import { reconcileShipping, type ReconciliationResult } from "./reconciliation";
import type { Settings } from "./settings";
import { finalShippingCost, type Parcel } from "./shipping";

// Batch weigh-in: each order's final shipping comes from its own weighed size
// (recorded at QC), priced with the same rate table as the quote, and is then
// reconciled against the top of the range the student already paid. The
// admin sees this preview before anything is posted.

export interface WeighInOrder {
  id: number;
  mode: ShippingMode;
  /** Whole-order parcel: the QC final size when recorded, else the estimate. */
  parcel: Parcel | null;
  parcelSource: "final" | "estimate";
  /** Shipping collected for this order (accepted quote's top of range). */
  paidSen: Sen;
  quotedMaxSen: Sen;
}

export interface WeighInRow {
  orderId: number;
  parcelSource: "final" | "estimate" | "missing";
  billableG: number;
  actualSen: Sen;
  paidSen: Sen;
  result: ReconciliationResult;
}

export interface WeighInPreview {
  rows: WeighInRow[];
  totals: { actualSen: Sen; paidSen: Sen; chargeSen: Sen; creditSen: Sen; absorbedSen: Sen };
}

export function previewWeighIn(
  orders: readonly WeighInOrder[],
  opts: { fxRate: FxRateMicro; settings: Settings; forwarder?: string },
): WeighInPreview {
  const forwarderName = opts.settings.shipping.forwarders.some((f) => f.name === opts.forwarder) ? opts.forwarder : undefined;
  const capPct = opts.settings.shipping.overRangeCapPct;
  const rows: WeighInRow[] = orders.map((o) => {
    if (!o.parcel) {
      // Nothing to price: no adjustment until a size is recorded.
      return { orderId: o.id, parcelSource: "missing", billableG: 0, actualSen: o.paidSen, paidSen: o.paidSen, result: reconcileShipping({ quotedMaxSen: o.quotedMaxSen, paidSen: o.paidSen, actualSen: o.paidSen, capPct }) };
    }
    const cost = finalShippingCost({ mode: o.mode, parcel: o.parcel, fxRate: opts.fxRate, settings: opts.settings, forwarder: forwarderName });
    return {
      orderId: o.id,
      parcelSource: o.parcelSource,
      billableG: cost.billableG,
      actualSen: cost.sen,
      paidSen: o.paidSen,
      result: reconcileShipping({ quotedMaxSen: o.quotedMaxSen, paidSen: o.paidSen, actualSen: cost.sen, capPct }),
    };
  });
  const sum = (f: (r: WeighInRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    rows,
    totals: {
      actualSen: sum((r) => r.actualSen),
      paidSen: sum((r) => r.paidSen),
      chargeSen: sum((r) => Math.max(0, r.result.ledgerAmountSen)),
      creditSen: sum((r) => Math.max(0, -r.result.ledgerAmountSen)),
      absorbedSen: sum((r) => r.result.absorbedSen),
    },
  };
}
