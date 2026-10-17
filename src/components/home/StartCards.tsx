import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "./SectionHeading";

const CARDS = [
  {
    path: "url",
    title: "You have a link",
    body: "Drop in any URL from a supported platform. We verify the seller and prepare your quote.",
    image: "/images/start-link.webp",
  },
  {
    path: "reverse_search",
    title: "You have a photo",
    body: "Upload a screenshot from TikTok, RedNote, Pinterest, or anywhere. We find the closest match.",
    image: "/images/start-photo.webp",
  },
  {
    path: "consultation",
    title: "You're not sure",
    body: "Share your budget and what you need. We research the options and recommend what to buy.",
    image: "/images/start-consult.webp",
  },
] as const;

export function StartCards() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <SectionHeading eyebrow="Get started" title="How would you like to start?" />
      {/* Three cards: a swipeable row on phones, a grid from tablets up. */}
      <div
        role="list"
        aria-label="Ways to start an order"
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0"
      >
        {CARDS.map((c, i) => (
          <Link
            key={c.path}
            href={`/order/new?path=${c.path}`}
            role="listitem"
            data-scroll-defer
            style={{ "--d": i }}
            className="reveal group relative isolate flex h-72 w-[82%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-6 sm:h-80 md:w-auto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
            <img
              src={c.image}
              alt=""
              loading="lazy"
              className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-[1.2s] ease-(--ease-out-expo) group-hover:scale-[1.06]"
            />
            <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
            <span className="glass absolute top-5 right-5 grid size-10 place-items-center rounded-full opacity-0 transition-all duration-500 ease-(--ease-out-expo) group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
              <ArrowUpRight className="size-4 transition-transform duration-500 group-hover:rotate-45" aria-hidden />
            </span>
            <h3 className="display text-3xl text-white">{c.title}</h3>
            <p className="mt-2 text-sm text-white/80">{c.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
