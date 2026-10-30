import { ArrowRight, Compass, ImageIcon, Link2, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense, type ReactNode } from "react";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { PageHero } from "@/components/site/PageHero";
import { Price } from "@/components/site/Price";
import { SectionTabs } from "@/components/site/SectionTabs";
import { getDb } from "@/db/client";
import { coordinationFeeDisplay } from "@/domain/fees";
import { SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatCny, formatMyr, type Sen } from "@/domain/money";
import { PRICING_EXAMPLE, pricingExample, shippingRateRows } from "@/domain/pricing";
import type { Settings } from "@/domain/settings";
import { roundUpTo100g } from "@/domain/shipping";
import { cn } from "@/lib/utils";
import { getSettings } from "@/server/data/catalog";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What each HaloHaul service costs: item at cost, a flat coordination fee, and shipping by weight.",
};

// Every number here comes from the admin Settings, so it changes with them.
const loadSettings = cache(async () => {
  await connection();
  return getSettings(getDb());
});

export default function PricingPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageHero
        eyebrow="Every fee upfront · in ringgit"
        title="Pricing"
        lede="What each service costs and when you pay. Nothing is bought until you've seen the full quote and said yes."
      >
        <SectionTabs
          items={[
            { href: "#services", label: "Services" },
            { href: "#shipping", label: "Shipping" },
            { href: "#example", label: "Example" },
          ]}
        />
      </PageHero>

      <ScrollScope className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 sm:pb-28">
        <section id="services" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="By service" caption="What you pay depends on how you start." />
          <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
            <Services />
          </Suspense>
        </section>

        <section id="shipping" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="International shipping" caption="From the warehouse in China to campus, charged by weight." />
          <Suspense fallback={<div className="mt-6 h-72 animate-pulse rounded-xl bg-white/5" />}>
            <Shipping />
          </Suspense>
        </section>

        <section id="example" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="A worked example" caption="One order from quote to pickup, with today's numbers." />
          <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-white/5" />}>
            <Example />
          </Suspense>

          <div className="mt-8 border-t border-white/8 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/order/new" className="btn-primary group">
                Start an order
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link href="/how-it-works" className="btn-secondary">
                How it works
              </Link>
            </div>
          </div>
        </section>
      </ScrollScope>
    </div>
  );
}

function PanelHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div>
      <h2 className="text-xl font-medium text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/50">{caption}</p>
    </div>
  );
}

// ---- By service -----------------------------------------------------------------

/**
 * Each package has its own colour, carried through its card, icon, price and
 * button. Class names are written out in full so Tailwind keeps them.
 */
const ACCENTS = {
  sky: {
    card: "border-sky-400/30 bg-linear-to-br from-sky-400/10 via-sky-400/[0.03] to-transparent",
    chip: "border-sky-400/40 bg-sky-400/15 text-sky-200",
    price: "text-sky-200",
    divider: "border-sky-400/20",
    cta: "text-sky-200 hover:text-sky-100",
  },
  violet: {
    card: "border-violet-400/30 bg-linear-to-br from-violet-400/10 via-violet-400/[0.03] to-transparent",
    chip: "border-violet-400/40 bg-violet-400/15 text-violet-200",
    price: "text-violet-200",
    divider: "border-violet-400/20",
    cta: "text-violet-200 hover:text-violet-100",
  },
  amber: {
    card: "border-amber-400/30 bg-linear-to-br from-amber-400/10 via-amber-400/[0.03] to-transparent",
    chip: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    price: "text-amber-200",
    divider: "border-amber-400/20",
    cta: "text-amber-200 hover:text-amber-100",
  },
} as const;

interface Service {
  path: string;
  accent: keyof typeof ACCENTS;
  /** The button at the bottom of the card. */
  cta: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  /** Paid before any work starts, or null when nothing is. */
  upfront: { label: string; sen: Sen } | null;
}

function services(s: Settings): Service[] {
  return [
    {
      path: "url",
      accent: "sky",
      cta: "Start with a link",
      icon: Link2,
      title: "You have a link",
      blurb: "A product page from Taobao, Pinduoduo, JD, Dewu, Xianyu and more.",
      upfront: null,
    },
    {
      path: "reverse_search",
      accent: "violet",
      cta: "Start a photo search",
      icon: ImageIcon,
      title: "You have a photo",
      blurb: "A screenshot from RedNote, TikTok or anywhere. We find the product.",
      upfront: { label: "Photo search fee", sen: s.fees.reverseSearchFeeSen },
    },
    {
      path: "consultation",
      accent: "amber",
      cta: "Ask for a consultation",
      icon: Compass,
      title: "You're not sure",
      blurb: "Tell us your budget and what you need. We research and recommend.",
      upfront: { label: "Consultation fee", sen: s.fees.consultationFeeSen },
    },
  ];
}

async function Services() {
  const s = await loadSettings();
  const fee = coordinationFeeDisplay(s);
  return (
    <>
      {fee.wasSen !== null ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-3 text-sm text-white/80">
          {fee.label ? <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200">{fee.label}</span> : null}
          <span>
            Coordination fee <Price sen={fee.sen} wasSen={fee.wasSen} className="font-medium text-white" /> per order.
          </span>
        </p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {services(s).map((svc) => {
          const a = ACCENTS[svc.accent];
          return (
            <li key={svc.path} className={cn("rounded-2xl border p-4 sm:p-5 md:grid md:grid-cols-2 md:gap-6", a.card)}>
              <div className="flex flex-col">
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border", a.chip)}>
                    <svc.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-medium text-white">{svc.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/55">{svc.blurb}</p>
                  </div>
                </div>
                <Link href={`/order/new?path=${svc.path}`} className={cn("group mt-4 inline-flex items-center gap-1.5 self-start text-sm font-medium transition-colors md:mt-auto md:pt-4", a.cta)}>
                  {svc.cta}
                  <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>

              <dl className={cn("mt-4 space-y-3 border-t pt-4 text-sm md:mt-0 md:border-t-0 md:border-l md:pt-0 md:pl-6", a.divider)}>
                <div>
                  <dt className="text-xs text-white/45">Before we start</dt>
                  <dd className="mt-1 flex items-baseline justify-between gap-3">
                    {svc.upfront ? (
                      <>
                        <span className="text-white/80">{svc.upfront.label}</span>
                        <span className={cn("font-medium whitespace-nowrap tabular-nums", a.price)}>{formatMyr(svc.upfront.sen)}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-white/80">Nothing</span>
                        <span className={cn("font-medium", a.price)}>Free</span>
                      </>
                    )}
                  </dd>
                  {svc.upfront ? (
                    <p className="mt-1 text-xs leading-relaxed text-white/45">Taken off your order if you buy. Kept if nothing suits you.</p>
                  ) : null}
                </div>
                <div>
                  <dt className="text-xs text-white/45">On your quote</dt>
                  <dd className="mt-1 space-y-1">
                    <Line label="Item" value="At cost" />
                    <Line label="Coordination fee" value={<Price sen={fee.sen} wasSen={fee.wasSen} />} />
                    <Line label="Shipping" value="By weight" />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-white/2 p-4 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:p-5">
        <p className="text-xs text-white/45 sm:pt-0.5">Getting it to you</p>
        <div className="space-y-1">
          <Line label="Campus pickup" value="Free" />
          <Line label="Lalamove delivery, per person" value={formatMyr(s.fees.lalamoveFeeSen)} />
        </div>
      </div>

      <ul className="mt-6 space-y-2 text-sm leading-relaxed text-white/60">
        <Note>
          <strong className="font-medium text-white/85">Item at cost</strong> means the seller&apos;s price in RMB, converted at the
          exchange rate printed on your quote (about RM {Number(s.fx.defaultMyrPerCny).toFixed(2)} per ¥1 today).
        </Note>
        <Note>The coordination fee is per order: one product line, whatever the quantity.</Note>
      </ul>
    </>
  );
}

// ---- Shipping -------------------------------------------------------------------

async function Shipping() {
  const s = await loadSettings();
  const rows = shippingRateRows(s);
  const divisor = rows[0]?.volumetricDivisor ?? 6000;
  return (
    <>
      <div className="mt-6 overflow-hidden rounded-xl border border-white/8">
        <table className="w-full text-sm">
          <thead className="bg-white/4 text-left text-xs text-white/50">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-normal">Mode</th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">Per kg</th>
              <th scope="col" className="hidden px-4 py-2.5 text-right font-normal sm:table-cell">Minimum</th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">Takes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {rows.map((r) => (
              <tr key={r.mode} className="bg-white/2">
                <th scope="row" className="px-4 py-3.5 text-left font-medium text-white">
                  {SHIPPING_MODE_LABELS[r.mode]}
                  <span className="mt-0.5 block text-xs font-normal text-white/45 sm:hidden">min {formatMyr(r.minChargeSen)}</span>
                </th>
                <td className="px-4 py-3.5 text-right whitespace-nowrap text-white tabular-nums">{formatMyr(r.perKgSen)}</td>
                <td className="hidden px-4 py-3.5 text-right whitespace-nowrap text-white/80 tabular-nums sm:table-cell">{formatMyr(r.minChargeSen)}</td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap text-white/80 tabular-nums">
                  {r.transitDays.min}–{r.transitDays.max} days
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-white/45">
        At today&apos;s exchange rate. Days are from batch cutoff to campus; see the{" "}
        <Link href="/shipping" className="link-underline tap-area text-white/70">
          shipping schedule
        </Link>
        .
      </p>

      <ul className="mt-6 space-y-2 text-sm leading-relaxed text-white/60">
        <Note>
          Charged per 0.1 kg of <strong className="font-medium text-white/85">billable weight</strong>: the heavier of the real weight
          and the size (length × width × height in cm ÷ {divisor.toLocaleString("en-MY")}). Bulky, light things are charged by size.
        </Note>
        <Note>
          Your quote shows a <strong className="font-medium text-white/85">range</strong>. You pay the top of it; once the warehouse
          weighs your item, anything less goes to your HaloHaul balance, or back to you if you ask.
        </Note>
        <Note>
          If it turns out heavier, you pay at most {s.shipping.overRangeCapPct}% above the top of the range. We cover the rest.
        </Note>
        <Note>Free shipping (包邮) on a listing only covers delivery inside China.</Note>
        <Note>PDD direct-ship orders have no international shipping.</Note>
      </ul>
    </>
  );
}

// ---- Example --------------------------------------------------------------------

const num = (g: number) => (g / 1000).toLocaleString("en-MY", { maximumFractionDigits: 2 });
// Non-breaking space, so "0.6 kg" never splits across lines.
const NBSP = String.fromCharCode(160);
const kg = (g: number) => `${num(g)}${NBSP}kg`;
const kgRange = (a: number, b: number) => (a === b ? kg(a) : `${num(a)}–${num(b)}${NBSP}kg`);

async function Example() {
  const s = await loadSettings();
  const fee = coordinationFeeDisplay(s);
  const ex = pricingExample(s);
  if (!ex) return null;
  const { quote, shipping, settlement } = ex;
  const mode = SHIPPING_MODE_LABELS[ex.mode].toLowerCase();
  const rate = Number(s.fx.defaultMyrPerCny).toFixed(2);
  const paidInTheEnd = quote.payableNowSen + settlement.ledgerAmountSen;

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm leading-relaxed text-white/70">
        Aina finds a {PRICING_EXAMPLE.itemName.toLowerCase()} on Taobao for {formatCny(ex.itemPriceFen)}. The seller says it weighs{" "}
        {kg(PRICING_EXAMPLE.parcel.weightG)}. She pastes the link, picks {mode} shipping and campus pickup.
      </p>

      <Receipt step={1} title="Her quote">
        <Line label={`${PRICING_EXAMPLE.itemName}, ${formatCny(ex.itemPriceFen)} × ${rate}`} value={formatMyr(quote.itemPriceSen)} />
        <Line label="Coordination fee" value={<Price sen={quote.serviceFeeSen} wasSen={fee.wasSen} />} />
        <Line
          label={`Shipping estimate, ${kgRange(roundUpTo100g(shipping.billableG), roundUpTo100g(shipping.billableMaxG))}`}
          value={`${formatMyr(quote.shippingMinSen)} – ${formatMyr(quote.shippingMaxSen)}`}
        />
        <Line label="Campus pickup" value="Free" />
        <Total label="Pays when she accepts (top of the range)" value={formatMyr(quote.payableNowSen)} />
      </Receipt>

      <Receipt step={2} title="After the warehouse weigh-in">
        <Line
          label={`Weighs ${kg(PRICING_EXAMPLE.weighedG)}, charged as ${kg(roundUpTo100g(ex.finalBillableG))}`}
          value={formatMyr(ex.finalShippingSen)}
        />
        {settlement.kind === "credit" ? (
          <Line label="Back to her HaloHaul balance" value={formatMyr(-settlement.ledgerAmountSen)} highlight />
        ) : settlement.kind === "charge" ? (
          <Line label="Extra to pay before pickup" value={formatMyr(settlement.ledgerAmountSen)} />
        ) : (
          <Line label="Difference" value="None" />
        )}
        <Total label="What the order cost her in the end" value={formatMyr(paidInTheEnd)} />
      </Receipt>

      <p className="text-xs leading-relaxed text-white/45">
        An example with today&apos;s fees and rates; your quote uses the real price and size of your item. If you started with a photo
        search or consultation, that fee is taken off the total.
      </p>
    </div>
  );
}

function Receipt({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/2 p-4 sm:p-5">
      <h3 className="flex items-center gap-3 font-medium text-white">
        <span className="icon-chip size-7 text-xs tabular-nums">{step}</span>
        {title}
      </h3>
      <div className="mt-4 space-y-2 text-sm">{children}</div>
    </div>
  );
}

// ---- Bits -----------------------------------------------------------------------

function Line({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-4">
      <span className="text-white/65">{label}</span>
      <span className={highlight ? "shrink-0 font-medium whitespace-nowrap text-emerald-300 tabular-nums" : "shrink-0 whitespace-nowrap text-white tabular-nums"}>{value}</span>
    </p>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-3 flex items-baseline justify-between gap-4 border-t border-white/8 pt-3">
      <span className="text-white/85">{label}</span>
      <span className="shrink-0 text-base font-medium text-white tabular-nums">{value}</span>
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-white/40" />
      <span>{children}</span>
    </li>
  );
}
