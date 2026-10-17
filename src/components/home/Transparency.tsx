import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionHeading } from "./SectionHeading";

const ITEMS = [
  {
    title: "Fees in full",
    body: "Product cost, service fee, and shipping are always shown separately. We don't bundle them.",
  },
  {
    title: "Warehouse-accurate shipping",
    body: "Your final shipping charge comes from the warehouse weigh-in. Any difference is settled before release.",
  },
  {
    title: "Photos where available",
    body: "QC photos from the forwarding agent when supported. We tell you which agents provide what.",
  },
  {
    title: "Nothing ships with a balance",
    body: "Any outstanding shipping difference is settled before your parcel is released. No exceptions.",
  },
];

export function Transparency() {
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:py-16 lg:grid-cols-[5fr_7fr] lg:gap-16">
      <div className="lg:sticky lg:top-32 lg:self-start">
        <SectionHeading
          eyebrow="Our promise"
          title="Built on transparency"
          lede="Nothing hidden, nothing bundled."
          className="lg:mb-0"
        />
      </div>
      <Accordion type="multiple" defaultValue={ITEMS.map((i) => i.title)} className="lg:pt-6">
        {ITEMS.map((item, i) => (
          <AccordionItem
            key={item.title}
            value={item.title}
            data-scroll-defer
            style={{ "--d": i }}
            className="reveal border-white/15"
          >
            <AccordionTrigger className="py-6 text-lg font-semibold sm:text-xl">
              <span className="flex items-baseline gap-4">
                <span className="text-sm font-normal text-white/40 tabular-nums">0{i + 1}</span>
                {item.title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-6 pl-9 text-base text-white/75">{item.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
