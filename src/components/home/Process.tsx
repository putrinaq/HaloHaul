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
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="display text-4xl sm:text-5xl">The Process</h2>
      <p className="mt-2 text-muted-foreground">Four steps, nothing hidden.</p>
      <ol className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative isolate flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-2xl p-4 sm:p-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static image */}
            <img src={s.image} alt="" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
            <span className="display text-4xl text-white sm:text-5xl">{i + 1}</span>
            <div>
              <h3 className="text-base font-medium text-white underline underline-offset-4 sm:text-lg">{s.title}</h3>
              <p className="mt-1 text-xs text-white/85 sm:text-sm">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
