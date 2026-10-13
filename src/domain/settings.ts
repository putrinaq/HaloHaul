import { z } from "zod";
import { BATCH_SHIPPING_MODES } from "./enums";

// The `settings` table holds a single row whose `data` column is validated by
// this schema. Every key has a default, so adding a setting never needs a
// migration, and an empty `{}` row yields a fully working configuration.

const sen = z.number().int().nonnegative();
const fen = z.number().int().nonnegative();
const pct = z.number().int().min(0).max(100);
const dayRange = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((r) => r.min <= r.max, "min must be ≤ max");

/**
 * Per-order consolidated pricing. Orders share one forwarder parcel, so no
 * order pays a first-kg premium:
 *   per-order shipping = max(minChargeSen, billable kg × (subsequentKgFen + spreadFen))
 * with billable weight rounded up to 0.1 kg.
 */
export const rateSchema = z.object({
  /** Forwarder's subsequent-kg rate (RMB fen per kg). */
  subsequentKgFen: fen,
  /** HaloHaul spread added per kg (RMB fen per kg). */
  spreadFen: fen.default(0),
  /** Floor for any single order's shipping (MYR sen). */
  minChargeSen: sen.default(0),
  /** Volumetric divisor (cm³ per kg). */
  volumetricDivisor: z.number().int().positive().default(6000),
});
export type Rate = z.infer<typeof rateSchema>;

export const forwarderSchema = z.object({
  name: z.string().min(1),
  rates: z.partialRecord(z.enum(BATCH_SHIPPING_MODES), rateSchema),
});
export type Forwarder = z.infer<typeof forwarderSchema>;

export const settingsSchema = z.object({
  fees: z
    .object({
      coordinationFeeSen: sen.default(600),
      reverseSearchFeeSen: sen.default(400),
      consultationFeeSen: sen.default(2500),
      lalamoveFeeSen: sen.default(300),
    })
    .prefault({}),
  fx: z
    .object({
      /** Default rate offered in the quote builder, decimal string (numeric(12,6)). */
      defaultMyrPerCny: z.string().regex(/^\d+(\.\d{1,6})?$/).default("0.650000"),
    })
    .prefault({}),
  shipping: z
    .object({
      defaultForwarder: z.string().min(1).default("default"),
      forwarders: z.array(forwarderSchema).min(1).default([
        {
          name: "default",
          // Placeholder rates — set real forwarder numbers in admin settings.
          rates: {
            air: { subsequentKgFen: 2000, spreadFen: 300, minChargeSen: 500, volumetricDivisor: 6000 },
            air_sensitive: {
              subsequentKgFen: 2800,
              spreadFen: 300,
              minChargeSen: 700,
              volumetricDivisor: 6000,
            },
            sea: { subsequentKgFen: 700, spreadFen: 200, minChargeSen: 500, volumetricDivisor: 6000 },
          },
        },
      ]),
      /**
       * Headroom added on top of the estimated weight to produce the top of the
       * quoted range. Seller-confirmed numbers are trusted more than category
       * defaults.
       */
      rangeHeadroomPct: z
        .object({
          sellerConfirmed: pct.default(15),
          categoryDefault: pct.default(35),
        })
        .prefault({}),
      /** Over-range charges are capped at this % above the top of the range. */
      overRangeCapPct: pct.default(20),
      /**
       * Days from batch cutoff (or purchase, for PDD direct-ship) to campus,
       * shown to students as an ETA range when they pick a mode.
       */
      transitDays: z
        .object({
          air: dayRange.default({ min: 7, max: 12 }),
          air_sensitive: dayRange.default({ min: 10, max: 16 }),
          sea: dayRange.default({ min: 21, max: 35 }),
          pdd_direct: dayRange.default({ min: 7, max: 14 }),
        })
        .prefault({}),
      /** How often each mode ships, shown under the home countdowns. */
      cadenceText: z
        .object({
          air: z.string().default("weekly consolidation"),
          air_sensitive: z.string().default("weekly consolidation"),
          sea: z.string().default("every 2 weeks"),
        })
        .prefault({}),
    })
    .prefault({}),
  pickup: z
    .object({
      /** Public campus pickup point. Never the operator's home address. */
      pointName: z.string().default("Campus pickup point"),
      pointNote: z.string().default(""),
      /** Shown on the site; the exact window is set per batch. */
      windowText: z.string().default("Weekday evenings — the exact window is sent when your batch arrives."),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsInput = z.input<typeof settingsSchema>;

export function parseSettings(data: unknown): Settings {
  return settingsSchema.parse(data ?? {});
}

export const DEFAULT_SETTINGS: Settings = parseSettings({});

export function findForwarder(settings: Settings, name?: string): Forwarder {
  const wanted = name ?? settings.shipping.defaultForwarder;
  const forwarder = settings.shipping.forwarders.find((f) => f.name === wanted);
  if (!forwarder) throw new Error(`Unknown forwarder "${wanted}"`);
  return forwarder;
}
