import { Plane, Ship, Truck } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { PLATFORM_LABELS, SHIPPING_MODE_LABELS } from "@/domain/labels";
import { formatMyr } from "@/lib/format";
import { getPublishedShowcase } from "@/server/data/catalog";
import { getPhotoStore } from "@/server/storage";
import { ScrollRow } from "./ScrollRow";

const MODE_ICON = { air: Plane, air_sensitive: Plane, sea: Ship, pdd_direct: Truck, none: null } as const;

/** "What people bought recently" — published showcase cards. */
export async function Showcase() {
  await connection();
  const cards = await getPublishedShowcase(getDb());
  if (cards.length === 0) return null;
  const store = getPhotoStore();
  const photos = await Promise.all(cards.map((c) => (c.photoKey && store ? store.presignGet(c.photoKey, 3600) : null)));

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="display text-4xl sm:text-5xl">What people bought recently</h2>
      <p className="mt-2 text-muted-foreground">Real orders. Real savings. All fees included in the HaloHaul price.</p>
      <div className="mt-8">
        <ScrollRow label="Recent orders">
          {cards.map((c, i) => {
            const saved = c.retailPriceSen > 0 ? Math.round((1 - c.halohaulPriceSen / c.retailPriceSen) * 100) : 0;
            const Icon = MODE_ICON[c.shippingMode];
            return (
              <article key={c.id} role="listitem" className="flex w-60 shrink-0 snap-start flex-col rounded-2xl bg-card p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gradient-to-br from-indigo-950 via-slate-900 to-black">
                  {photos[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL
                    <img src={photos[i]!} alt={c.title} loading="lazy" className="size-full object-cover" />
                  ) : null}
                  {saved > 0 ? (
                    <span className="absolute top-2 right-2 rounded-md bg-black/50 px-2 py-1 text-center leading-none backdrop-blur">
                      <span className="block text-[9px] tracking-wider text-white/70">SAVED</span>
                      <span className="text-base font-semibold">{saved}%</span>
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-1.5 text-[11px]">
                  <span className="rounded-full bg-white/15 px-2 py-0.5">{PLATFORM_LABELS[c.platform]}</span>
                  {Icon ? (
                    <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                      <Icon className="size-3" aria-hidden /> {SHIPPING_MODE_LABELS[c.shippingMode]}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 font-semibold">{c.title}</h3>
                {c.variant ? <p className="text-xs text-muted-foreground">{c.variant}</p> : null}
                <dl className="mt-3 flex justify-between text-xs">
                  <div>
                    <dt className="text-muted-foreground">Est. retail price</dt>
                    <dd className="text-sm text-muted-foreground line-through">{formatMyr(c.retailPriceSen)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-muted-foreground">Paid via HaloHaul</dt>
                    <dd className="text-sm font-semibold text-brand">{formatMyr(c.halohaulPriceSen)}</dd>
                  </div>
                </dl>
                <Link
                  href={`/order/new?showcase=${c.id}`}
                  className="mt-3 rounded-lg bg-white/15 py-2 text-center text-xs transition-colors hover:bg-white/25"
                >
                  Order for myself
                </Link>
              </article>
            );
          })}
        </ScrollRow>
      </div>
    </section>
  );
}
