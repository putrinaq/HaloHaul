import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { formatMyr } from "@/lib/format";
import { getSettings } from "@/server/data/catalog";

export const metadata: Metadata = { title: "How it works" };

const STEPS = [
  {
    title: "1. Tell us what you want",
    body: "Paste a product link from Taobao, Pinduoduo, 1688, JD, Dewu, Weidian, Xianyu, Meituan, RedNote or Douyin — or upload a screenshot, or just describe what you need. Measurements you give us are checked against the seller's size chart.",
  },
  {
    title: "2. Get a clear quote",
    body: "We check the seller, stock and options, then send a quote with every line separate: the item at cost (in RMB and ringgit, with the exchange rate), our coordination fee, and a shipping estimate range.",
  },
  {
    title: "3. Approve and pay",
    body: "Nothing is bought until you accept the quote and pay. We collect the top of the shipping estimate; after the warehouse weighs your parcel, anything less is credited to your HaloHaul balance.",
  },
  {
    title: "4. We buy, check and ship",
    body: "We order from the seller, the forwarder's warehouse receives and checks it, and it joins the next consolidated batch to Malaysia — by air or sea, your choice.",
  },
  {
    title: "5. Collect on campus",
    body: "When the batch lands we message you with the pickup window. Prefer delivery? Choose Lalamove when you order.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-12 px-4 py-12">
      <header>
        <h1 className="display text-5xl sm:text-6xl">How it works</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          A personal buyer for China&apos;s marketplaces, with every fee shown before you pay.
        </p>
      </header>

      <ol className="space-y-6">
        {STEPS.map((s) => (
          <li key={s.title} className="rounded-2xl bg-card p-6">
            <h2 className="text-lg font-medium">{s.title}</h2>
            <p className="mt-2 text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <section>
        <h2 className="display text-3xl">Fees</h2>
        <Suspense fallback={<div className="mt-4 h-40 animate-pulse rounded-2xl bg-card" />}>
          <FeeTable />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="display text-3xl">Good to know</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Free shipping (包邮) on a listing only covers delivery inside China. International shipping still applies.</li>
          <li>PDD direct-ship orders skip the forwarder: you pay the item and our fee, and PDD sets the delivery time.</li>
          <li>Some items (batteries, liquids, magnets, blades) need a special line or can&apos;t ship. We check before quoting.</li>
          <li>Nothing is released for pickup while a shipping balance is owed.</li>
        </ul>
        <p>
          <Link href="/order/new" className="underline underline-offset-4">
            Start an order
          </Link>{" "}
          or read the{" "}
          <Link href="/terms" className="underline underline-offset-4">
            terms
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

async function FeeTable() {
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
    <table className="mt-4 w-full overflow-hidden rounded-2xl bg-card text-sm">
      <tbody className="divide-y divide-white/10">
        {rows.map(([name, price, note]) => (
          <tr key={name}>
            <th scope="row" className="p-4 text-left font-medium">
              {name}
            </th>
            <td className="p-4 tabular-nums">{price}</td>
            <td className="p-4 text-muted-foreground">{note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
