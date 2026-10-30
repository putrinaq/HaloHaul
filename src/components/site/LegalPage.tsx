import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { getSettings } from "@/server/data/catalog";

// Shared layout for the Terms and Privacy pages: title, date, a contents list,
// and numbered sections with stable anchors (other pages link to them).

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalPage({ title, lede, updated, sections, children }: { title: string; lede: ReactNode; updated: string; sections: LegalSection[]; children?: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 text-[15px] leading-relaxed sm:py-16">
      <header>
        <h1 className="display text-5xl sm:text-6xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{lede}</p>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      </header>

      <nav aria-label="Contents" className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-5">
        <p className="text-sm font-medium">Contents</p>
        <ol className="mt-3 grid list-decimal gap-x-8 gap-y-1.5 pl-5 text-sm text-muted-foreground sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <Link href={`#${s.id}`} className="link-underline tap-area hover:text-foreground">
                {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10 [&_a]:underline [&_a]:underline-offset-2 [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-28 space-y-3">
            <h2 className="display text-3xl">
              <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
              {s.title}
            </h2>
            {s.body}
          </section>
        ))}
        {children}
      </div>
    </article>
  );
}

/** The operator's name and contact details from Settings → Store. */
export async function BusinessDetails() {
  await connection();
  const { store } = await getSettings(getDb());
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-4">
      <p className="font-medium text-foreground">{store.businessName}</p>
      {store.businessDetails ? (
        <p className="mt-1 whitespace-pre-line">{store.businessDetails}</p>
      ) : (
        <p className="mt-1">Message us on WhatsApp from the number we contact you on about your orders.</p>
      )}
    </div>
  );
}
