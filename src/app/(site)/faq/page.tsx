import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { PageHero } from "@/components/site/PageHero";
import { SectionTabs } from "@/components/site/SectionTabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getDb } from "@/db/client";
import { coordinationFeeDisplay } from "@/domain/fees";
import { formatMyr } from "@/domain/money";
import type { Settings } from "@/domain/settings";
import { getSettings } from "@/server/data/catalog";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers about ordering from China through HaloHaul: fees, payment, shipping times, pickup, cancellations and refunds.",
};

interface Faq {
  q: string;
  a: string;
  link?: { href: string; label: string };
}

interface Group {
  id: string;
  title: string;
  items: Faq[];
}

/** Numbers come from Settings, so the answers change when the fees or rates do. */
function groups(s: Settings): Group[] {
  const fee = coordinationFeeDisplay(s);
  const feeText = fee.wasSen !== null ? `${formatMyr(fee.sen)} (usually ${formatMyr(fee.wasSen)})` : formatMyr(fee.sen);
  const t = s.shipping.transitDays;
  const days = (m: keyof typeof t) => `${t[m].min}–${t[m].max} days`;
  const quoteDays = `${s.quote.validDays} day${s.quote.validDays === 1 ? "" : "s"}`;

  return [
    {
      id: "ordering",
      title: "Ordering",
      items: [
        {
          q: "What is HaloHaul?",
          a: "A personal buyer for China's marketplaces. You tell us what you want, we buy it for you, ship it to Malaysia with other students' orders, and hand it over on campus.",
          link: { href: "/how-it-works", label: "How it works" },
        },
        {
          q: "Which platforms can I order from?",
          a: "Taobao, Tmall, Pinduoduo, 1688, JD, Dewu, Weidian, Xianyu, Meituan, RedNote and Douyin. Paste the product link and we take it from there.",
        },
        {
          q: "I only have a photo or a RedNote post. Can you still find it?",
          a: `Yes. Choose "You have a photo" and upload a screenshot. A photo search costs ${formatMyr(s.fees.reverseSearchFeeSen)}, paid before we start, and it's taken off your order if you buy.`,
        },
        {
          q: "I'm not sure what to buy. Can you help?",
          a: `Choose "You're not sure", tell us what you need and your budget, and we'll research the options and recommend some. A consultation costs ${formatMyr(s.fees.consultationFeeSen)}, taken off your order if you go ahead.`,
        },
        {
          q: "Why do you ask for my measurements?",
          a: "Chinese sizes run differently, and every seller has their own size chart. We check your height, weight and measurements against the seller's chart to pick the right size. Save them in your account and they fill in next time.",
        },
        {
          q: "Can I order more than one item?",
          a: "Each order is one product (any quantity of it, up to 99). For different products, place one order each. They can travel in the same batch.",
        },
        {
          q: "Is there anything you can't ship?",
          a: "Some items (batteries, liquids, magnets, blades and similar) need a special shipping line or can't be imported at all. We check every order before quoting and tell you if something can't go.",
          link: { href: "/terms#restricted", label: "Restricted items" },
        },
      ],
    },
    {
      id: "costs",
      title: "Costs",
      items: [
        {
          q: "What will I pay?",
          a: `The item at the seller's price (converted from RMB at the rate on your quote), our coordination fee of ${feeText} per order, and international shipping by weight. Campus pickup is free; Lalamove delivery is ${formatMyr(s.fees.lalamoveFeeSen)}.`,
          link: { href: "/pricing", label: "See full pricing" },
        },
        {
          q: "Why is shipping shown as a range?",
          a: "Until the warehouse weighs your item, we only have the seller's weight or a typical one for the category. You pay the top of the range; once it's weighed, anything less goes back to your HaloHaul balance.",
        },
        {
          q: "What if my parcel turns out heavier than the estimate?",
          a: `You pay the difference, but never more than ${s.shipping.overRangeCapPct}% above the top of your quoted range. We cover anything beyond that.`,
        },
        {
          q: "The listing says free shipping (包邮). Why do I still pay shipping?",
          a: "包邮 only covers delivery inside China, from the seller to our warehouse. Shipping from China to Malaysia is separate.",
        },
        {
          q: "Are there any hidden fees?",
          a: "No. Every quote lists the item, our fee and the shipping range separately, and nothing is bought until you accept it.",
        },
      ],
    },
    {
      id: "payment",
      title: "Payment",
      items: [
        {
          q: "How do I pay?",
          a: "By DuitNow. Accept your quote, scan the QR code or use the details on your order page, pay the exact amount, then upload a screenshot of your receipt.",
        },
        {
          q: "When do you buy my item?",
          a: "As soon as we've confirmed your payment has arrived. We never buy anything before you've accepted the quote and paid.",
        },
        {
          q: "How long is a quote valid?",
          a: `${quoteDays}. After that the seller's price, stock or the exchange rate may have changed, so we'll send you a new quote.`,
        },
      ],
    },
    {
      id: "shipping",
      title: "Shipping and pickup",
      items: [
        {
          q: "How long does it take?",
          a: `From the batch cutoff to campus: air ${days("air")}, air for sensitive goods ${days("air_sensitive")}, sea ${days("sea")}. Pinduoduo direct-ship orders take ${days("pdd_direct")} from purchase.`,
          link: { href: "/shipping", label: "Shipping schedule" },
        },
        {
          q: "What's a batch cutoff?",
          a: "Orders travel together in batches. To join a batch, your item must reach the warehouse with everything paid by its cutoff. Anything later moves to the next batch automatically.",
        },
        {
          q: "Where and when do I collect my order?",
          a: `At ${s.pickup.pointName}. ${s.pickup.windowText} We message you on WhatsApp when your batch arrives.`,
        },
        {
          q: "Can you deliver it to me instead?",
          a: `Yes, by Lalamove for ${formatMyr(s.fees.lalamoveFeeSen)} per person. Choose it when you order.`,
        },
        {
          q: "Can I track my order?",
          a: "Yes. Your order page shows each step, from quote to pickup, with photos from the warehouse check where available.",
          link: { href: "/orders", label: "My orders" },
        },
      ],
    },
    {
      id: "problems",
      title: "Changes and problems",
      items: [
        {
          q: "Can I cancel?",
          a: "Free of charge before you pay. After paying, until we buy the item, with a full refund. Once it's bought, contact us and we'll see what the seller allows.",
          link: { href: "/terms#cancellation", label: "Cancellation terms" },
        },
        {
          q: "What if my item arrives wrong or damaged?",
          a: "The warehouse checks items when they arrive. If something's wrong or faulty, we take it up with the seller for a return, exchange or refund. If a parcel is damaged or lost in transit, we claim from the forwarder for you.",
        },
        {
          q: "How do refunds work?",
          a: "Money we owe you goes to your HaloHaul balance and is used on your next order. If you'd rather have cash, ask us and we'll refund it to the account you paid from.",
        },
        {
          q: "Can I buy secondhand?",
          a: "Yes, for example from Xianyu. Secondhand items are sold as the seller describes them, condition can vary and they usually can't be returned.",
        },
      ],
    },
    {
      id: "account",
      title: "Account and privacy",
      items: [
        {
          q: "What do you do with my details?",
          a: "We use them only to handle your orders and contact you about them. We don't sell your data or use advertising trackers.",
          link: { href: "/privacy", label: "Privacy Policy" },
        },
        {
          q: "How do I delete my account?",
          a: "Ask us and we'll delete your personal data and photos. Order records we must keep for accounting are anonymised. You can remove saved measurements yourself, any time, in your account.",
        },
      ],
    },
  ];
}

export default function FaqPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageHero eyebrow="Questions students ask" title="FAQ" lede="Quick answers about ordering, costs, payment, shipping and pickup.">
        <SectionTabs
          items={[
            { href: "#ordering", label: "Ordering" },
            { href: "#costs", label: "Costs" },
            { href: "#shipping", label: "Shipping" },
          ]}
        />
      </PageHero>
      <ScrollScope className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-20 sm:pb-28">
        <Suspense fallback={<div className="glass-panel h-96 animate-pulse" />}>
          <Answers />
        </Suspense>
        <section data-scroll-defer className="glass-panel reveal p-5 text-center sm:p-8">
          <h2 className="text-xl font-medium text-white">Still have a question?</h2>
          <p className="mt-1 text-sm text-white/60">Message us on WhatsApp, or start an order and ask in the remarks.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/order/new" className="btn-primary">
              Start an order
            </Link>
            <Link href="/pricing" className="btn-secondary">
              See pricing
            </Link>
          </div>
        </section>
      </ScrollScope>
    </div>
  );
}

async function Answers() {
  await connection();
  const all = groups(await getSettings(getDb()));
  // FAQ rich results in search engines.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: all.flatMap((g) => g.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }))),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {all.map((g) => (
        <section key={g.id} id={g.id} data-scroll-defer className="glass-panel reveal scroll-mt-28 p-5 sm:p-8">
          <h2 className="text-xl font-medium text-white">{g.title}</h2>
          <Accordion type="multiple" className="mt-4">
            {g.items.map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-white/10">
                <AccordionTrigger className="py-4 text-left text-base font-medium text-white">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-4 text-[15px] leading-relaxed text-white/65">
                  <p>{f.a}</p>
                  {f.link ? (
                    <Link href={f.link.href} className="link-underline tap-area mt-2 inline-block text-white/85">
                      {f.link.label} →
                    </Link>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
    </>
  );
}
