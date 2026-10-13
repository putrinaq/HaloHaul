import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getRestrictedKeywords, getSettings } from "@/server/data/catalog";
import { formatMyr } from "@/lib/format";

export const metadata: Metadata = { title: "Terms & privacy" };

// DRAFT — have this reviewed before launch.

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12 text-[15px] leading-relaxed [&_h2]:display [&_h2]:text-3xl [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
      <header>
        <h1 className="display text-5xl sm:text-6xl">Terms &amp; privacy</h1>
        <p className="mt-2">Plain-language terms for ordering through HaloHaul.</p>
      </header>

      <section className="space-y-3">
        <h2>What we do</h2>
        <p>
          HaloHaul is a personal buying service. You ask us to buy an item from a Chinese marketplace; we buy it on
          your behalf, have it shipped to Malaysia with a forwarder, and hand it to you on campus. We are not the
          seller, and the item&apos;s quality and description are the seller&apos;s responsibility — but we check what
          we can and help with problems.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Quotes and payment</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Nothing is bought until you accept a quote and your payment is confirmed.</li>
          <li>Quotes show the item price at cost (RMB, with the exchange rate used), our coordination fee, and a shipping estimate range, separately.</li>
          <li>Quotes expire; prices and stock can change after that.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Shipping estimates</h2>
        <Suspense fallback={<p>Loading…</p>}>
          <ShippingTerms />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2>Cancellation</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>You can cancel free of charge before you pay.</li>
          <li>After paying, you can still cancel until we buy the item from the seller; you get a full refund.</li>
          <li>Once we have bought the item, the order can&apos;t be cancelled through the site. Contact us and we&apos;ll see what the seller allows.</li>
          <li>Photo-search and consultation fees cover work already done and aren&apos;t refunded, but they&apos;re credited toward your order if you go ahead.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Secondhand items</h2>
        <p>
          Secondhand items (for example from Xianyu) are sold as described by the seller. Condition can vary from the
          photos, and they usually can&apos;t be returned. Only choose secondhand if you&apos;re comfortable with that.
        </p>
      </section>

      <section className="space-y-3" id="restricted">
        <h2>Restricted items</h2>
        <p>
          Some items can&apos;t be shipped by air, need a special line, or can&apos;t be imported at all. We check every
          order against our list before quoting, and may refuse or reroute an order. Currently flagged:
        </p>
        <Suspense fallback={<p>Loading…</p>}>
          <RestrictedList />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2>Why we might reject an order</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>The item is restricted, counterfeit, or not allowed into Malaysia.</li>
          <li>The seller can&apos;t be verified, is out of stock, or won&apos;t ship to the warehouse.</li>
          <li>The item fails our quality check at the warehouse — in which case you are refunded for it.</li>
          <li>We can&apos;t find a match for a photo search (the search fee is kept for the work done).</li>
        </ul>
      </section>

      <section className="space-y-3" id="privacy">
        <h2>Privacy notice (PDPA)</h2>
        <p>
          We follow Malaysia&apos;s Personal Data Protection Act 2010. This notice explains what we collect and why.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">What we collect:</strong> your name, email, WhatsApp number and campus;
            the orders you place; photos you upload; and measurements or prescriptions you give us for sizing.
          </li>
          <li>
            <strong className="text-foreground">Why:</strong> only to source, buy, ship and hand over your orders, and
            to contact you about them. Measurements and prescriptions are used only to choose the right size or lens.
          </li>
          <li>
            <strong className="text-foreground">Who sees it:</strong> the HaloHaul operator. Sellers and forwarders
            receive only what&apos;s needed to fulfil an order (never your phone number unless delivery needs it).
            Lalamove receives your delivery details if you choose delivery.
          </li>
          <li>
            <strong className="text-foreground">Photos:</strong> stored privately and only viewable by you and the
            operator. Location and camera data are removed when you upload.
          </li>
          <li>
            <strong className="text-foreground">How long:</strong> order and payment records are kept for 7 years for
            accounting. Saved measurements stay until you remove them in your account.
          </li>
          <li>
            <strong className="text-foreground">Your rights:</strong> you can see and correct your details in your
            account, remove saved measurements at any time, and ask us to delete your account and personal data
            (order records we must keep for accounting are anonymised instead).
          </li>
        </ul>
      </section>
    </article>
  );
}

async function ShippingTerms() {
  await connection();
  const s = await getSettings(getDb());
  return (
    <ul className="list-disc space-y-2 pl-5">
      <li>Shipping is estimated from the seller&apos;s weight or typical weights for the category, so it&apos;s shown as a range.</li>
      <li>When you pay, we collect the top of the range.</li>
      <li>Your final shipping charge comes from the warehouse weigh-in. If it&apos;s less than you paid, the difference is credited to your HaloHaul balance (or refunded in cash on request).</li>
      <li>
        If it&apos;s more, you pay the difference — but never more than {s.shipping.overRangeCapPct}% above the top of
        the quoted range. We absorb anything beyond that.
      </li>
      <li>Nothing is released for pickup while a balance is owed.</li>
      <li>Lalamove delivery is {formatMyr(s.fees.lalamoveFeeSen)} per person.</li>
    </ul>
  );
}

async function RestrictedList() {
  await connection();
  const items = await getRestrictedKeywords(getDb());
  if (items.length === 0) return <p>No items are flagged right now.</p>;
  // Group keywords that share a note (e.g. the English and Chinese spellings).
  const seen = new Set<string>();
  const notes = items.filter((i) => !i.note || (!seen.has(i.note) && (seen.add(i.note), true)));
  return (
    <ul className="list-disc space-y-1 pl-5">
      {notes.map((i) => (
        <li key={i.keyword}>
          <span className="text-foreground">{i.keyword}</span>
          {i.note ? ` — ${i.note}` : null}
        </li>
      ))}
    </ul>
  );
}
