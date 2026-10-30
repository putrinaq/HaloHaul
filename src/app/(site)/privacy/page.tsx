import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BusinessDetails, LegalPage, type LegalSection } from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How HaloHaul collects, uses and protects your personal data under Malaysia's Personal Data Protection Act 2010.",
};

// Written for the Personal Data Protection Act 2010 (as amended in 2024).
// The Act asks for this notice in Malay as well as English. Have both
// reviewed by someone qualified in Malaysian law before relying on them.

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          HaloHaul is the data user responsible for your personal data under Malaysia&apos;s Personal Data Protection
          Act 2010 (PDPA). This policy explains what we collect, why, who we share it with and your rights. Contact:
        </p>
        <Suspense fallback={<p>Loading…</p>}>
          <BusinessDetails />
        </Suspense>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li><strong>Account:</strong> your name, email address and sign-in details.</li>
        <li><strong>Contact:</strong> your WhatsApp number and campus, and a delivery address if you choose Lalamove.</li>
        <li><strong>Orders:</strong> the links, items, options, notes and messages you send us, and your order history.</li>
        <li>
          <strong>Measurements and prescriptions:</strong> body measurements (such as height, weight and chest) and,
          for glasses or contact lenses, your prescription.
        </li>
        <li>
          <strong>Photos:</strong> pictures you upload, such as screenshots for a photo search and payment receipts.
          Receipts can show your name and bank; we use them only to confirm payment.
        </li>
        <li><strong>Payments:</strong> amounts, dates and references. We never see or store your bank login or card details.</li>
        <li><strong>Technical:</strong> for security, your sign-in sessions record your IP address and browser type.</li>
      </ul>
    ),
  },
  {
    id: "sources",
    title: "Where it comes from",
    body: (
      <p>
        Almost everything comes from you. Our forwarder adds your parcel&apos;s weight, size and quality-check photos
        when it reaches the warehouse.
      </p>
    ),
  },
  {
    id: "use",
    title: "Why we use it",
    body: (
      <ul>
        <li>To source, quote, buy, ship and hand over your orders.</li>
        <li>To contact you about your orders by WhatsApp or email.</li>
        <li>To choose the right size or lens (measurements and prescriptions are used for nothing else).</li>
        <li>To confirm payments, settle balances and keep the accounting records the law requires.</li>
        <li>To keep accounts secure and prevent fraud.</li>
        <li>To improve the service, using totals and trends that don&apos;t identify you.</li>
      </ul>
    ),
  },
  {
    id: "consent",
    title: "Your consent, and what's required",
    body: (
      <>
        <p>
          By creating an account or placing an order, you consent to us processing your data as described here.
          Entering a prescription is your explicit consent for us to use that health information to fulfil your order.
        </p>
        <p>
          Your name, email, WhatsApp number and the details of what you want are required: without them we can&apos;t
          take your order. Saved measurements, your campus and photos for orders that don&apos;t need them are optional.
        </p>
      </>
    ),
  },
  {
    id: "share",
    title: "Who we share it with",
    body: (
      <>
        <ul>
          <li><strong>Our forwarder:</strong> the order and parcel details needed to receive, check and ship your item.</li>
          <li><strong>Lalamove:</strong> your name, phone number and address, only if you choose delivery.</li>
          <li>
            <strong>Sellers:</strong> nothing that identifies you. We buy under our own account and ship to the
            forwarder&apos;s warehouse.
          </li>
          <li>
            <strong>Service providers that run the site for us:</strong> our hosting provider, Cloudflare (photo
            storage) and Resend (email delivery). They process data only on our instructions.
          </li>
          <li><strong>Authorities:</strong> when the law requires it.</li>
        </ul>
        <p>We don&apos;t sell your data, and we don&apos;t use advertising trackers.</p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Transfers outside Malaysia",
    body: (
      <p>
        Some of these providers store or process data outside Malaysia (for example in Singapore, the EU or the
        United States), and our forwarder is in China. We only use providers with appropriate safeguards, and only
        share what each one needs.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <ul>
        <li>The site only works over an encrypted connection (HTTPS).</li>
        <li>Photos are stored privately: only you and the HaloHaul operator can open them, through links that expire.</li>
        <li>Location and camera details are removed from photos when you upload them.</li>
        <li>The admin area needs two-factor sign-in, and only the operator has access.</li>
        <li>If a data breach affects your personal data, we&apos;ll tell you and the Personal Data Protection Commissioner as the law requires.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Order and payment records: 7 years, for accounting and tax.</li>
        <li>Saved measurements: until you remove them in your account.</li>
        <li>Items in your cart: until you submit or remove them, or 90 days after you last changed them.</li>
        <li>Photos and messages: as long as the order record, unless you ask us to delete your account sooner.</li>
        <li>Sign-in sessions: until they expire or you sign out.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <ul>
          <li><strong>See your data:</strong> most of it is in your account; ask us for a copy of the rest.</li>
          <li><strong>Correct it:</strong> edit your details in your account, or ask us.</li>
          <li><strong>Remove measurements:</strong> any time, in your account.</li>
          <li>
            <strong>Delete your account:</strong> ask us and we&apos;ll delete your personal data and photos. Order
            records we must keep for accounting are anonymised instead.
          </li>
          <li><strong>Withdraw consent or limit how we use your data:</strong> ask us; we may then be unable to complete open orders.</li>
        </ul>
        <p>
          We reply to requests within 21 days. If you&apos;re unhappy with how we handle your data, you can complain to
          the Personal Data Protection Commissioner (Jabatan Perlindungan Data Peribadi).
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use one essential cookie to keep you signed in, and your browser may remember small preferences on your
        device. There are no advertising or tracking cookies.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy; the date at the top shows the latest version, and we&apos;ll tell you about
        important changes. See also our <Link href="/terms">Terms &amp; Conditions</Link>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lede="What personal data HaloHaul collects, why, and your rights under Malaysia's Personal Data Protection Act 2010."
      updated="30 October 2026"
      sections={SECTIONS}
    />
  );
}
