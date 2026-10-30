import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BusinessDetails, LegalPage, type LegalSection } from "@/components/site/LegalPage";
import { getDb } from "@/db/client";
import { formatMyr } from "@/lib/format";
import { getRestrictedKeywords, getSettings } from "@/server/data/catalog";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms for ordering through HaloHaul: quotes, payment, shipping, pickup, cancellations and refunds.",
};

// Have these reviewed by someone qualified in Malaysian law before relying on them.

const loading = <p>Loading…</p>;

const SECTIONS: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <>
        <p>
          These terms apply whenever you use HaloHaul or place an order with us. By creating an account or placing an
          order, you agree to them. HaloHaul is run by:
        </p>
        <Suspense fallback={loading}>
          <BusinessDetails />
        </Suspense>
        <p>
          You need to be 18 or over to order, or have a parent or guardian&apos;s permission. How we handle your
          personal data is explained in our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "What we do",
    body: (
      <p>
        HaloHaul is a personal buying service. You ask us to buy an item from a Chinese marketplace; we buy it on your
        behalf, have it shipped to Malaysia with a forwarder, and hand it to you on campus or send it by Lalamove. We
        act as your agent: we are not the seller, and the item&apos;s quality and description are the seller&apos;s
        responsibility. We check what we can and help you when something goes wrong.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>Give us accurate details, including a WhatsApp number we can reach you on.</li>
        <li>Keep your sign-in to yourself. You&apos;re responsible for orders placed from your account.</li>
        <li>We may suspend an account that&apos;s used for fraud, abuse or items we can&apos;t legally handle.</li>
      </ul>
    ),
  },
  {
    id: "requests",
    title: "Placing a request",
    body: (
      <ul>
        <li>Tell us exactly what you want: the link, option (colour, size, version) and quantity.</li>
        <li>
          For clothing and other sized items we ask for your measurements and check them against the seller&apos;s
          size chart. Sizing differs between sellers, so we can&apos;t guarantee fit. Measure carefully and tell us
          how you like things to fit.
        </li>
        <li>
          A photo search or consultation has a fee, paid before we start. It&apos;s credited toward your order if you
          go ahead, and kept for the work done if you don&apos;t. See <Link href="/pricing">Pricing</Link>.
        </li>
      </ul>
    ),
  },
  {
    id: "quotes",
    title: "Quotes and prices",
    body: (
      <Suspense fallback={loading}>
        <QuoteTerms />
      </Suspense>
    ),
  },
  {
    id: "payment",
    title: "Payment",
    body: (
      <ul>
        <li>Pay by DuitNow to the details shown on your order, for the exact amount, then upload your receipt.</li>
        <li>Your payment counts once we&apos;ve confirmed the money has arrived. Nothing is bought before that.</li>
        <li>If a receipt doesn&apos;t match a payment we received, we&apos;ll tell you why and the order waits until it&apos;s sorted.</li>
        <li>A false or edited receipt means the order is cancelled and the account may be closed.</li>
      </ul>
    ),
  },
  {
    id: "shipping",
    title: "Shipping and the weigh-in",
    body: (
      <>
        <Suspense fallback={loading}>
          <ShippingTerms />
        </Suspense>
        <p>
          Orders travel in batches with cutoff dates (see the <Link href="/shipping">shipping schedule</Link>).
          Delivery times are estimates: customs, the forwarder and holidays can delay a batch. Import duties or taxes
          set by Malaysian authorities, where they apply, are payable by you.
        </p>
      </>
    ),
  },
  {
    id: "pickup",
    title: "Pickup and delivery",
    body: (
      <Suspense fallback={loading}>
        <PickupTerms />
      </Suspense>
    ),
  },
  {
    id: "quality",
    title: "Quality checks, damage and loss",
    body: (
      <ul>
        <li>The warehouse checks items when they arrive and we share photos where the forwarder provides them.</li>
        <li>
          If an item arrives at the warehouse wrong or faulty, we contact the seller for a return, exchange or refund
          under the seller&apos;s policy, and keep you updated.
        </li>
        <li>
          If a parcel is lost or damaged in transit, we claim from the forwarder and pass on to you what we recover
          for your item.
        </li>
        <li>Please check your item at pickup and tell us about any problem straight away.</li>
      </ul>
    ),
  },
  {
    id: "cancellation",
    title: "Cancellation",
    body: (
      <ul>
        <li>You can cancel free of charge before you pay.</li>
        <li>After paying, you can still cancel until we buy the item from the seller, and you get a full refund.</li>
        <li>Once we&apos;ve bought the item, the order can&apos;t be cancelled through the site. Contact us and we&apos;ll see what the seller allows.</li>
        <li>Photo search and consultation fees cover work already done and aren&apos;t refunded.</li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Refunds and credit",
    body: (
      <ul>
        <li>Money we owe you (a shipping difference, a cancelled order, an item the seller couldn&apos;t supply) goes to your HaloHaul balance and is used on your next order.</li>
        <li>Prefer cash? Ask us and we&apos;ll refund it to the account you paid from.</li>
        <li>Fees for work already done (searches, consultations, buying an item you then cancel) aren&apos;t refundable unless the problem was ours.</li>
      </ul>
    ),
  },
  {
    id: "secondhand",
    title: "Secondhand items",
    body: (
      <p>
        Secondhand items (for example from Xianyu) are sold as described by the seller. Condition can differ from
        the photos and they usually can&apos;t be returned. Only choose secondhand if you&apos;re comfortable with that.
      </p>
    ),
  },
  {
    id: "restricted",
    title: "Restricted and prohibited items",
    body: (
      <>
        <p>
          Some items can&apos;t go by air, need a special shipping line, or can&apos;t be imported at all. We check every
          order before quoting and may refuse or reroute one. We don&apos;t buy counterfeit goods or anything illegal to
          import into Malaysia. Currently flagged:
        </p>
        <Suspense fallback={loading}>
          <RestrictedList />
        </Suspense>
      </>
    ),
  },
  {
    id: "rejection",
    title: "Why we might turn down an order",
    body: (
      <ul>
        <li>The item is restricted, counterfeit, or not allowed into Malaysia.</li>
        <li>The seller can&apos;t be verified, is out of stock, or won&apos;t ship to the warehouse.</li>
        <li>The item fails the warehouse check (you&apos;re refunded for it).</li>
        <li>We can&apos;t find a match for a photo search (the search fee is kept for the work done).</li>
      </ul>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility",
    body: (
      <>
        <p>
          We take reasonable care with every order. We&apos;re not responsible for what&apos;s outside our control: a
          seller&apos;s description or quality, customs decisions, or delays by forwarders, couriers or authorities.
        </p>
        <p>
          Where we are at fault, our responsibility for an order is limited to the amount you paid us for it. Nothing
          in these terms takes away your rights under Malaysian law, including the Consumer Protection Act 1999.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes, law and contact",
    body: (
      <>
        <p>
          We may update these terms; the date at the top shows the latest version. Orders already placed follow the
          terms that applied when you placed them. These terms are governed by the laws of Malaysia.
        </p>
        <p>Questions or complaints: contact us using the details in section 1. We aim to reply within 3 working days.</p>
      </>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      lede="The plain-language terms for ordering through HaloHaul."
      updated="30 October 2026"
      sections={SECTIONS}
    >
      {/* Old links pointed at /terms#privacy. */}
      <section id="privacy" className="scroll-mt-28 rounded-2xl border border-white/10 bg-white/3 p-5">
        <p>
          Looking for how we use your personal data? Read our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}

const loadSettings = async () => {
  await connection();
  return getSettings(getDb());
};

async function QuoteTerms() {
  const s = await loadSettings();
  return (
    <ul>
      <li>
        Every quote shows, separately: the item at cost (in RMB, with the exchange rate used), our coordination fee,
        a shipping estimate range and any delivery fee.
      </li>
      <li>
        A quote is open for {s.quote.validDays} day{s.quote.validDays === 1 ? "" : "s"}. After that, prices, stock and
        exchange rates can change and we&apos;ll send a new quote.
      </li>
      <li>Promotional prices apply to orders quoted while the promotion runs.</li>
    </ul>
  );
}

async function ShippingTerms() {
  const s = await loadSettings();
  return (
    <ul>
      <li>Shipping is estimated from the seller&apos;s weight or typical weights for the category, so it&apos;s shown as a range.</li>
      <li>When you pay, we collect the top of the range.</li>
      <li>
        Your final shipping charge comes from the warehouse weigh-in. If it&apos;s less than you paid, the difference
        goes to your HaloHaul balance (or is refunded in cash on request).
      </li>
      <li>
        If it&apos;s more, you pay the difference, but never more than {s.shipping.overRangeCapPct}% above the top of the
        quoted range. We cover anything beyond that.
      </li>
    </ul>
  );
}

async function PickupTerms() {
  const s = await loadSettings();
  return (
    <ul>
      <li>
        Campus pickup is free, at {s.pickup.pointName}. {s.pickup.windowText}
      </li>
      <li>Lalamove delivery is {formatMyr(s.fees.lalamoveFeeSen)} per person, to the address you give us.</li>
      <li>Nothing is released while a shipping balance is owed.</li>
      <li>Can&apos;t make the pickup window? Tell us and we&apos;ll arrange another time.</li>
    </ul>
  );
}

async function RestrictedList() {
  await connection();
  const items = await getRestrictedKeywords(getDb());
  if (items.length === 0) return <p>No items are flagged right now.</p>;
  // Keywords that share a note (e.g. English and Chinese spellings) are listed once.
  const seen = new Set<string>();
  const notes = items.filter((i) => !i.note || (!seen.has(i.note) && (seen.add(i.note), true)));
  return (
    <ul>
      {notes.map((i) => (
        <li key={i.keyword}>
          <span className="text-foreground">{i.keyword}</span>
          {i.note ? ` — ${i.note}` : null}
        </li>
      ))}
    </ul>
  );
}
