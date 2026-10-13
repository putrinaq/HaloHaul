import Link from "next/link";
import { ScrollRow } from "./ScrollRow";

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
    path: "digital",
    title: "You want a digital product",
    body: "Software, subscriptions, in-game credits. We source legitimate purchases you can't easily make yourself.",
    image: "/images/start-digital.webp",
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
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <h2 className="display text-4xl sm:text-5xl">How would you like to start?</h2>
      <div className="mt-8">
        <ScrollRow label="Ways to start an order">
          {CARDS.map((c) => (
            <Link
              key={c.path}
              href={`/order/new?path=${c.path}`}
              role="listitem"
              className="group relative isolate flex h-64 w-[82%] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl p-5 sm:h-72 sm:w-[23rem]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
              <img
                src={c.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <h3 className="display text-3xl text-white">{c.title}</h3>
              <p className="mt-1 text-sm text-white/85">{c.body}</p>
            </Link>
          ))}
        </ScrollRow>
      </div>
    </section>
  );
}
