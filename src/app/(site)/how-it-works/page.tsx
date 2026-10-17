import { ArrowRight, BatteryWarning, Package, Plane, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { PageHero } from "@/components/site/PageHero";
import { SectionTabs } from "@/components/site/SectionTabs";
import { getDb } from "@/db/client";
import { formatMyr } from "@/lib/format";
import { getSettings } from "@/server/data/catalog";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  {
    title: "Tell us what you want",
    body: "Paste a product link from Taobao, Pinduoduo, 1688, JD, Dewu, Weidian, Xianyu, Meituan, RedNote or Douyin — or upload a screenshot, or just describe what you need. Measurements you give us are checked against the seller's size chart.",
  },
  {
    title: "Get a clear quote",
    body: "We check the seller, stock and options, then send a quote with every line separate: the item at cost (in RMB and ringgit, with the exchange rate), our coordination fee, and a shipping estimate range.",
  },
  {
    title: "Approve and pay",
    body: "Nothing is bought until you accept the quote and pay. We collect the top of the shipping estimate; after the warehouse weighs your parcel, anything less is credited to your HaloHaul balance.",
  },
  {
    title: "We buy, check and ship",
    body: "We order from the seller, the forwarder's warehouse receives and checks it, and it joins the next consolidated batch to Malaysia — by air or sea, your choice.",
  },
  {
    title: "Collect on campus",
    body: "When the batch lands we message you with the pickup window. Prefer delivery? Choose Lalamove when you order.",
  },
];

const NOTES = [
  {
    icon: Package,
    text: "Free shipping (包邮) on a listing only covers delivery inside China. International shipping still applies.",
  },
  {
    icon: Plane,
    text: "PDD direct-ship orders skip the forwarder: you pay the item and our fee, and PDD sets the delivery time.",
  },
  {
    icon: BatteryWarning,
    text: "Some items (batteries, liquids, magnets, blades) need a special line or can't ship. We check before quoting.",
  },
  { icon: Wallet, text: "Nothing is released for pickup while a shipping balance is owed." },
];

export default function HowItWorksPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageHero
        eyebrow="Five steps · every fee upfront"
        title="How it works"
        lede="A personal buyer for China's marketplaces, with every fee shown before you pay."
      >
        <SectionTabs
          items={[
            { href: "#steps", label: "Steps" },
            { href: "#fees", label: "Fees" },
            { href: "#good-to-know", label: "Good to know" },
          ]}
        />
      </PageHero>

      <ScrollScope className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 sm:pb-28">
        <section id="steps" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="The steps" caption="From link to pickup." />
          <ol className="mt-6 divide-y divide-white/8">
            {STEPS.map((s, i) => (
              <li key={s.title} data-scroll-defer style={{ "--d": i }} className="reveal flex gap-4 py-5 first:pt-0 last:pb-0">
                <span className="icon-chip tabular-nums">{i + 1}</span>
                <div>
                  <h3 className="font-medium text-white">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/60">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="fees" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="Fees" caption="Set in advance and shown on every quote." />
          <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-xl bg-white/5" />}>
            <FeeRows />
          </Suspense>
        </section>

        <section id="good-to-know" data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <PanelHeading title="Good to know" caption="The fine print, in plain words." />
          <ul className="mt-6 space-y-4">
            {NOTES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-4 text-sm leading-relaxed text-white/70">
                <span className="icon-chip">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-2">{text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 border-t border-white/8 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/order/new" className="btn-primary group">
                Start an order
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link href="/shipping" className="btn-secondary">
                See the shipping schedule
              </Link>
            </div>
            <p className="mt-4 text-center text-xs text-white/45">
              By ordering you agree to our{" "}
              <Link href="/terms" className="link-underline tap-area text-white/70">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/terms#privacy" className="link-underline tap-area text-white/70">
                PDPA notice
              </Link>
              .
            </p>
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

async function FeeRows() {
  await connection();
  const s = await getSettings(getDb());
  const rows: Array<[string, string, string]> = [
    ["Coordination fee", formatMyr(s.fees.coordinationFeeSen), "Per order, on every quote"],
    ["Photo search", formatMyr(s.fees.reverseSearchFeeSen), "Paid before we search; credited if you order"],
    ["Consultation", formatMyr(s.fees.consultationFeeSen), "Paid before we research; credited if you order"],
    ["Lalamove delivery", formatMyr(s.fees.lalamoveFeeSen), "Optional, per person"],
    ["Campus pickup", "Free", s.pickup.pointName],
  ];
  return (
    <dl className="mt-6 overflow-hidden rounded-xl border border-white/8">
      {rows.map(([name, price, note]) => (
        <div
          key={name}
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-white/8 bg-white/2 px-4 py-3.5 last:border-b-0 sm:grid-cols-[12rem_1fr_auto] sm:items-center"
        >
          <dt className="text-sm font-medium text-white">{name}</dt>
          <dd className="col-start-1 text-xs text-white/50 sm:col-start-2 sm:row-start-1 sm:text-sm">{note}</dd>
          <dd className="col-start-2 row-span-2 row-start-1 self-center text-right text-sm font-medium text-white tabular-nums sm:col-start-3 sm:row-span-1">
            {price}
          </dd>
        </div>
      ))}
    </dl>
  );
}
