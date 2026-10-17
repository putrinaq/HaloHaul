import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ProductCard } from "@/components/catalogue/ProductCard";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { getDb } from "@/db/client";
import { getPublishedShowcase } from "@/server/data/catalog";
import { getPhotoStore } from "@/server/storage";
import { ScrollRow } from "./ScrollRow";
import { SectionHeading } from "./SectionHeading";

/** "What people bought recently": the first published showcase cards, linking to /catalogue. */
export async function Showcase() {
  await connection();
  const cards = await getPublishedShowcase(getDb());
  if (cards.length === 0) return null;
  const store = getPhotoStore();
  const photos = await Promise.all(cards.map((c) => (c.photoKey && store ? store.presignGet(c.photoKey, 3600) : null)));

  // Streams in behind Suspense, so it registers its own scroll animations.
  return (
    <ScrollScope>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <SectionHeading
          eyebrow="Recent orders"
          title="What people bought recently"
          lede="Real orders. Real savings. All fees included in the HaloHaul price."
          action={
            <Link
              href="/catalogue"
              className="group -ml-1 flex min-h-11 items-center gap-1 px-1 text-sm text-white/80 hover:text-white sm:ml-0 sm:min-h-0 sm:px-0"
            >
              See all
              <ChevronRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          }
        />
        <ScrollRow label="Recent orders">
          {cards.map((c, i) => (
            <ProductCard
              key={c.id}
              role="listitem"
              data-scroll-defer
              card={{ ...c, photo: photos[i] }}
              style={{ "--d": Math.min(i, 4) }}
              className="reveal w-64 shrink-0 snap-start"
            />
          ))}
        </ScrollRow>
      </section>
    </ScrollScope>
  );
}
