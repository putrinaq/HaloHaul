import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { savedPercent, type ProductCardData } from "@/components/catalogue/ProductCard";
import { PageHero } from "@/components/site/PageHero";
import { getDb } from "@/db/client";
import { getPublishedShowcase } from "@/server/data/catalog";
import { getPhotoStore } from "@/server/storage";
import { CatalogueGrid } from "./CatalogueGrid";

export const metadata: Metadata = {
  title: "What people bought",
  description: "Real HaloHaul orders with the retail price next to what people actually paid, fees included.",
};

/** The whole published showcase; small enough to filter in the browser. */
const CATALOGUE_LIMIT = 200;

export default function CataloguePage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <PageHero
        eyebrow="Real orders · real savings"
        title="What people bought"
        lede="Recent HaloHaul orders, with the usual retail price next to what people paid, fees included."
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-20 sm:pb-28">
        <Suspense fallback={<CatalogueSkeleton />}>
          <Catalogue />
        </Suspense>
      </div>
    </div>
  );
}

async function Catalogue() {
  await connection();
  const rows = await getPublishedShowcase(getDb(), CATALOGUE_LIMIT);
  if (rows.length === 0) {
    return (
      <div className="glass-panel mx-auto max-w-xl p-8 text-center">
        <p className="font-medium">The catalogue is being stocked</p>
        <p className="mt-1 text-sm text-white/60">
          Completed orders appear here once they&apos;ve been picked up. In the meantime, tell us what you&apos;re after.
        </p>
        <Link href="/order/new" className="btn-primary mt-6">
          Start an order
        </Link>
      </div>
    );
  }

  const store = getPhotoStore();
  const cards: ProductCardData[] = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.title,
      variant: r.variant,
      platform: r.platform,
      shippingMode: r.shippingMode,
      retailPriceSen: r.retailPriceSen,
      halohaulPriceSen: r.halohaulPriceSen,
      photo: r.photoKey && store ? await store.presignGet(r.photoKey, 3600) : null,
    })),
  );

  const savings = cards.map(savedPercent).filter((s) => s > 0);
  const average = savings.length ? Math.round(savings.reduce((a, b) => a + b, 0) / savings.length) : 0;
  const best = savings.length ? Math.max(...savings) : 0;

  return (
    <>
      {/* Sits over the light ribbon, so it needs its own dark glass to stay legible. */}
      <dl className="mx-auto mb-8 grid max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-neutral-950/80 text-center shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl">
        <Stat label="Items" value={String(cards.length)} />
        <Stat label="Avg. saving" value={average ? `${average}%` : "—"} />
        <Stat label="Best saving" value={best ? `${best}%` : "—"} />
      </dl>
      <CatalogueGrid cards={cards} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-4">
      <dt className="text-xs text-white/60">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-white tabular-nums sm:text-2xl">{value}</dd>
    </div>
  );
}

function CatalogueSkeleton() {
  return (
    <div className="space-y-6">
      <div className="mx-auto h-20 max-w-2xl animate-pulse rounded-2xl bg-white/5" />
      <div className="h-28 animate-pulse rounded-[1.75rem] bg-white/5" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-3/4 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
