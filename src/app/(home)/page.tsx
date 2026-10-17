import { Suspense } from "react";
import { ClosingCta } from "@/components/home/ClosingCta";
import { Cutoffs, CutoffsSection, CutoffsSkeleton } from "@/components/home/Cutoffs";
import { Hero } from "@/components/home/Hero";
import { Process } from "@/components/home/Process";
import { Showcase } from "@/components/home/Showcase";
import { StartCards } from "@/components/home/StartCards";
import { Transparency } from "@/components/home/Transparency";
import { ScrollScope } from "@/components/motion/ScrollScope";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

// Static sections prerender into the shell; countdowns and the showcase read
// the database at request time and stream in behind their boundaries.
// <ScrollScope> registers the page's scroll animations, including streamed ones.
export default function HomePage() {
  return (
    <ScrollScope>
      <SiteHeader overlay />
      <main>
        <Hero />
        <StartCards />
        <CutoffsSection>
          <Suspense fallback={<CutoffsSkeleton />}>
            <Cutoffs />
          </Suspense>
        </CutoffsSection>
        <Process />
        <Suspense fallback={null}>
          <Showcase />
        </Suspense>
        <Transparency />
        <ClosingCta />
      </main>
      <SiteFooter />
    </ScrollScope>
  );
}
