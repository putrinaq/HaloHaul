import type { ShippingChoiceSnapshot } from "./analytics";
import type { OrderStatus } from "./enums";

// Report maths, kept pure: the page and the CSV export both use these.

// ---- speed vs price ---------------------------------------------------------------

export interface SpeedPriceRow {
  mode: string;
  orders: number;
  choseCheapest: number;
  choseFastest: number;
  /** Average extra paid over the cheapest option shown (top of range, sen). */
  avgExtraSen: number;
  /** Average days saved versus the cheapest option (when both had an ETA). */
  avgDaysSaved: number | null;
}

/**
 * What students picked against what they were shown: only snapshots with a
 * real choice (two or more priced options) count.
 */
export function speedVsPrice(snapshots: readonly ShippingChoiceSnapshot[]): SpeedPriceRow[] {
  const by = new Map<string, { n: number; cheap: number; fast: number; extra: number; saved: number; savedN: number }>();
  for (const s of snapshots) {
    const opts = s.options.filter((o) => o.maxSen > 0 || o.mode === "pdd_direct");
    if (opts.length < 2) continue;
    const chosen = opts.find((o) => o.mode === s.chosen);
    if (!chosen) continue;
    const cheapest = opts.reduce((a, b) => (b.maxSen < a.maxSen ? b : a));
    const withEta = opts.filter((o) => o.etaDaysMax !== null);
    const fastest = withEta.length ? withEta.reduce((a, b) => (b.etaDaysMax! < a.etaDaysMax! ? b : a)) : null;
    const row = by.get(s.chosen) ?? { n: 0, cheap: 0, fast: 0, extra: 0, saved: 0, savedN: 0 };
    row.n++;
    if (chosen.maxSen === cheapest.maxSen) row.cheap++;
    if (fastest && chosen.etaDaysMax === fastest.etaDaysMax) row.fast++;
    row.extra += chosen.maxSen - cheapest.maxSen;
    if (chosen.etaDaysMax !== null && cheapest.etaDaysMax !== null) {
      row.saved += cheapest.etaDaysMax - chosen.etaDaysMax;
      row.savedN++;
    }
    by.set(s.chosen, row);
  }
  return [...by]
    .map(([mode, r]) => ({
      mode,
      orders: r.n,
      choseCheapest: r.cheap,
      choseFastest: r.fast,
      avgExtraSen: Math.round(r.extra / r.n),
      avgDaysSaved: r.savedN ? Math.round((r.saved / r.savedN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.orders - a.orders);
}

// ---- time in each status ----------------------------------------------------------

export interface HistoryPoint {
  orderId: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  at: Date;
}

export interface StatusDurationRow {
  status: OrderStatus;
  /** Completed stays only: entered and then left. */
  samples: number;
  avgHours: number;
  medianHours: number;
}

/**
 * How long orders sit in each status, from the history. Note rows (from = to)
 * are ignored, and the current status doesn't count until the order leaves it.
 */
export function timeInStatus(points: readonly HistoryPoint[]): StatusDurationRow[] {
  const byOrder = new Map<number, HistoryPoint[]>();
  for (const p of points) {
    if (p.fromStatus !== null && p.fromStatus === p.toStatus) continue;
    byOrder.set(p.orderId, [...(byOrder.get(p.orderId) ?? []), p]);
  }
  const hours = new Map<OrderStatus, number[]>();
  for (const rows of byOrder.values()) {
    rows.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (let i = 0; i < rows.length - 1; i++) {
      const h = (rows[i + 1].at.getTime() - rows[i].at.getTime()) / 3_600_000;
      hours.set(rows[i].toStatus, [...(hours.get(rows[i].toStatus) ?? []), h]);
    }
  }
  return [...hours]
    .map(([status, hs]) => {
      const sorted = hs.toSorted((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return { status, samples: hs.length, avgHours: round1(hs.reduce((s, x) => s + x, 0) / hs.length), medianHours: round1(median) };
    })
    .sort((a, b) => b.avgHours - a.avgHours);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- CSV ------------------------------------------------------------------------------

/**
 * RFC 4180 CSV. Cells starting with = + - @ (or a tab/CR) are prefixed with a
 * quote so spreadsheets don't run them as formulas.
 */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
