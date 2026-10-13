import { z } from "zod";
import { BATCH_SHIPPING_MODES } from "./enums";

// The `settings` table holds a single row whose `data` column is validated by
// this schema. Every key has a default, so adding a setting never needs a
// migration, and an empty `{}` row yields a fully working configuration.

const sen = z.number().int().nonnegative();
const fen = z.number().int().nonnegative();
const pct = z.number().int().min(0).max(100);

export const rateSchema = z.object({
  /** Charge for the first (or only) kg of billable weight. */
  firstKgFen: fen,
  /** Charge per additional kg, pro-rated per `stepG`. */
  additionalKgFen: fen,
  /** Billable weight beyond the first kg is rounded up to this step. */
  stepG: z.union([z.literal(100), z.literal(500), z.literal(1000)]).default(1000),
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
          rates: {
            air: { firstKgFen: 3000, additionalKgFen: 2000, stepG: 1000, volumetricDivisor: 6000 },
            air_sensitive: {
              firstKgFen: 4000,
              additionalKgFen: 2800,
              stepG: 1000,
              volumetricDivisor: 6000,
            },
            sea: { firstKgFen: 1500, additionalKgFen: 800, stepG: 1000, volumetricDivisor: 6000 },
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
    })
    .prefault({}),
  pickup: z
    .object({
      /** Public campus pickup point. Never the operator's home address. */
      pointName: z.string().default("Campus pickup point"),
      pointNote: z.string().default(""),
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
