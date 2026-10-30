import { FileCheck2, Link2, MapPin, PackageCheck, Plane, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// How an order travels, as a diagram: six stages, coloured by who acts, under
// a band showing where it happens. Two rows of three from tablets up, so it
// fits the same column as the other panels; a vertical timeline on phones.
// All of it is real text in ordered lists, so it reads in order without the
// picture.

type Actor = "you" | "us" | "partners";

const ACTORS: Record<Actor, { label: string; chip: string; ring: string; dot: string }> = {
  you: { label: "You", chip: "bg-sky-400/15 text-sky-200", ring: "border-sky-400/50 bg-sky-400/15 text-sky-200", dot: "bg-sky-400" },
  us: { label: "HaloHaul", chip: "bg-violet-400/15 text-violet-200", ring: "border-violet-400/50 bg-violet-400/15 text-violet-200", dot: "bg-violet-400" },
  partners: { label: "Warehouse & shipping", chip: "bg-amber-400/15 text-amber-200", ring: "border-amber-400/50 bg-amber-400/15 text-amber-200", dot: "bg-amber-400" },
};

interface Stage {
  icon: LucideIcon;
  title: string;
  body: string;
  actor: Actor;
  /** Where the stage happens. */
  place: "Online" | "China" | "On the way" | "Malaysia";
  /** Money moving at this stage, if any. */
  money?: string;
}

const STAGES: Stage[] = [
  { icon: Link2, title: "Send your request", body: "A link, a photo, or what you need.", actor: "you", place: "Online" },
  { icon: FileCheck2, title: "We check and quote", body: "Seller, stock and size, with every fee listed.", actor: "us", place: "Online" },
  { icon: Wallet, title: "Accept and pay", body: "Nothing is bought until you do.", actor: "you", place: "Online", money: "Item + fee + top of the shipping range" },
  { icon: PackageCheck, title: "We buy, it's checked", body: "The seller ships to our warehouse, which checks it.", actor: "us", place: "China" },
  { icon: Plane, title: "Ships in a batch", body: "By air or sea with other students' orders.", actor: "partners", place: "On the way", money: "Weigh-in: any shipping difference settled" },
  { icon: MapPin, title: "Collect it", body: "On campus, or by Lalamove.", actor: "you", place: "Malaysia" },
];

/** Two rows of three on wider screens: online first, then the parcel's trip. */
const ROWS = [STAGES.slice(0, 3), STAGES.slice(3)];

/** Places in a row, with how many columns each spans. */
function placesOf(row: Stage[]) {
  return row.reduce<Array<{ place: Stage["place"]; span: number }>>((acc, s) => {
    const last = acc.at(-1);
    if (last?.place === s.place) last.span += 1;
    else acc.push({ place: s.place, span: 1 });
    return acc;
  }, []);
}

const SPAN = ["", "md:col-span-1", "md:col-span-2", "md:col-span-3"];

export function JourneyDiagram() {
  return (
    <figure aria-labelledby="journey-caption">
      <div className="relative md:space-y-8">
        {/* Phones: one line down through every icon. */}
        <span aria-hidden className="absolute top-6 bottom-6 left-6 w-px bg-linear-to-b from-sky-400/50 via-violet-400/50 to-amber-400/50 md:hidden" />

        {ROWS.map((row, r) => {
          const offset = ROWS.slice(0, r).reduce((n, x) => n + x.length, 0);
          return (
            <div key={r}>
              {/* Where it happens: a band over the row (phones show it per stage). */}
              <div aria-hidden className="mb-6 hidden gap-3 md:grid md:grid-cols-3">
                {placesOf(row).map((p) => (
                  <div key={p.place} className={cn("rounded-full border border-white/10 bg-white/4 py-1 text-center text-xs text-white/55", SPAN[p.span])}>
                    {p.place}
                  </div>
                ))}
              </div>

              <ol start={offset + 1} className={cn("relative grid md:grid-cols-3 md:gap-4", r < ROWS.length - 1 && "pb-6 md:pb-0")}>
                {/* Wider screens: a line across the row's icons. */}
                <span aria-hidden className="absolute top-6 right-[16.67%] left-[16.67%] hidden h-px bg-linear-to-r from-sky-400/50 via-violet-400/50 to-amber-400/50 md:block" />

                {row.map((s, j) => {
                  const i = offset + j;
                  const a = ACTORS[s.actor];
                  return (
                    <li key={s.title} data-scroll-defer style={{ "--d": i }} className="reveal relative flex gap-4 pb-6 last:pb-0 md:flex-col md:items-center md:gap-3 md:pb-0 md:text-center">
                      {/* Solid backing, so the path line doesn't show through the tinted circle. */}
                      <span className="relative z-10 size-12 shrink-0 rounded-full bg-neutral-950">
                        <span className={cn("grid size-full place-items-center rounded-full border", a.ring)}>
                          <s.icon className="size-5" aria-hidden />
                        </span>
                        <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-white text-[10px] font-semibold text-black tabular-nums">
                          {i + 1}
                        </span>
                      </span>
                      <div className="min-w-0 pt-1 md:pt-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 md:justify-center">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", a.chip)}>{a.label}</span>
                          <span className="text-[11px] text-white/45 md:hidden">{s.place}</span>
                        </p>
                        <h3 className="mt-1.5 font-medium text-white">{s.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-white/60">{s.body}</p>
                        {s.money ? (
                          <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/8 px-2 py-1 text-left text-xs text-emerald-200">
                            <Wallet className="mt-px size-3.5 shrink-0" aria-hidden />
                            {s.money}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>

      <figcaption id="journey-caption" className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/8 pt-4 text-xs text-white/55">
        <span className="sr-only">How an order travels, in six stages. Colours show who does each one:</span>
        {(Object.keys(ACTORS) as Actor[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", ACTORS[k].dot)} />
            {ACTORS[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="size-3.5 text-emerald-300" aria-hidden />
          Money changes hands
        </span>
      </figcaption>
    </figure>
  );
}
