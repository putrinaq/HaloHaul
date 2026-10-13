import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="display text-4xl sm:text-5xl">Built on transparency</h2>
      <p className="mt-2 text-muted-foreground">Nothing hidden, nothing bundled.</p>
      <Accordion type="multiple" defaultValue={ITEMS.map((i) => i.title)} className="mt-6">
        {ITEMS.map((item) => (
          <AccordionItem key={item.title} value={item.title} className="border-white/30">
            <AccordionTrigger className="text-lg font-semibold">{item.title}</AccordionTrigger>
            <AccordionContent className="text-base text-white/85">{item.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
