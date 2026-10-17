import type { ReactNode } from "react";
import { RibbonVideo } from "./RibbonVideo";

/**
 * Hero for content pages: the light-ribbon video reaches up behind the sticky
 * header (-top-40 > header height) and down behind the first panel, so the
 * glass floats over the light as in the modal design, then fades to black.
 */
export function PageHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="relative isolate px-4 pt-14 pb-16 text-center sm:pt-20 sm:pb-24">
      <RibbonVideo className="-top-40 -bottom-72 -z-10" />
      <p className="intro-fade mx-auto inline-flex rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-xs text-white/75 backdrop-blur-md" style={{ "--d": 0 }}>
        {eyebrow}
      </p>
      <h1 className="display mt-6 text-5xl leading-[1.02] sm:text-7xl">
        <span className="line-mask">
          <span className="intro-rise" style={{ "--d": 0 }}>
            {title}
          </span>
        </span>
      </h1>
      <p className="intro-fade mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg" style={{ "--d": 1 }}>
        {lede}
      </p>
      {children ? (
        <div className="intro-fade mt-8 flex justify-center" style={{ "--d": 2 }}>
          {children}
        </div>
      ) : null}
    </header>
  );
}
