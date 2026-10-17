import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    title: "Submit a request",
    body: "A link, a photo, or a description. The form adapts to what you have.",
    image: "/images/step-1.webp",
  },
  {
    title: "Receive a quote",
    body: "We research the product, verify the seller, and return a clear breakdown — product, service fee and shipping, all separate.",
    image: "/images/step-2.webp",
  },
  {
    title: "Approve and pay",
    body: "Review every line before paying. Nothing is purchased without your explicit approval.",
    image: "/images/step-3.webp",
  },
  {
    title: "It arrives in Malaysia",
    body: "We handle the purchase, forwarding and consolidation, then hand it over on campus.",
    image: "/images/step-4.webp",
  },
];

export function Process() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <SectionHeading eyebrow="How it works" title="The Process" lede="Four steps, nothing hidden." />
      <ol className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            data-scroll-defer
            style={{ "--d": i }}
            className="reveal group relative isolate flex aspect-3/4 flex-col justify-between overflow-hidden rounded-2xl p-4 sm:p-6"
          >
            {/* Oversized so the inner parallax never shows an edge. */}
            <div data-scroll-defer data-scroll-speed="-0.04" className="absolute inset-x-0 top-[-12%] -z-20 h-[124%]">
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
              <img
                src={s.image}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-1000 ease-(--ease-out-expo) group-hover:scale-105"
              />
            </div>
            <div className="absolute inset-0 -z-10 bg-linear-to-t from-black/90 via-black/25 to-black/10" />
            <span className="display text-4xl text-white/90 sm:text-6xl">0{i + 1}</span>
            <div>
              <h3 className="text-base font-medium text-white sm:text-lg">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-white/75 sm:text-sm">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
