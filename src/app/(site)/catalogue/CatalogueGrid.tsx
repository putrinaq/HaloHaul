"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ProductCard, savedPercent, type ProductCardData } from "@/components/catalogue/ProductCard";
import type { Platform } from "@/domain/enums";
import { PLATFORM_LABELS } from "@/domain/labels";
import { cleanText } from "@/domain/sanitize";
import { cn } from "@/lib/utils";

const MODES = [
  { id: "all", label: "All" },
  { id: "air", label: "Air" },
  { id: "sea", label: "Sea" },
] as const;
type ModeFilter = (typeof MODES)[number]["id"];

const SORTS = [
  { id: "featured", label: "Featured" },
  { id: "saving", label: "Biggest saving" },
  { id: "price", label: "Lowest price" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

/**
 * Filters run in the browser over the published list (it's small), so every
 * change is instant. The search box never leaves the page; its text is still
 * cleaned and capped like any other input.
 */
export function CatalogueGrid({ cards }: { cards: ProductCardData[] }) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [sort, setSort] = useState<Sort>("featured");
  const deferredQuery = useDeferredValue(query);

  const platforms = useMemo(() => [...new Set(cards.map((c) => c.platform))], [cards]);

  const shown = useMemo(() => {
    const q = cleanText(deferredQuery).toLowerCase();
    const list = cards.filter(
      (c) =>
        (platform === "all" || c.platform === platform) &&
        (mode === "all" || (mode === "sea" ? c.shippingMode === "sea" : c.shippingMode === "air" || c.shippingMode === "air_sensitive")) &&
        (!q || `${c.title} ${c.variant ?? ""} ${PLATFORM_LABELS[c.platform]}`.toLowerCase().includes(q)),
    );
    if (sort === "saving") return [...list].sort((a, b) => savedPercent(b) - savedPercent(a));
    if (sort === "price") return [...list].sort((a, b) => a.halohaulPriceSen - b.halohaulPriceSen);
    return list;
  }, [cards, deferredQuery, platform, mode, sort]);

  const filtered = query !== "" || platform !== "all" || mode !== "all";
  const reset = () => {
    setQuery("");
    setPlatform("all");
    setMode("all");
  };

  return (
    <div>
      {/* Controls */}
      <div className="glass-panel space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="group relative flex-1">
            <span className="sr-only">Search what people bought</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-white/40 group-focus-within:text-white/80" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value.slice(0, 60))}
              maxLength={60}
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search items, e.g. sneakers"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pr-10 pl-10 text-base text-white outline-none placeholder:text-white/35 focus:border-white/40 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-white/50 hover:text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>

          <div className="flex gap-3">
            <div role="radiogroup" aria-label="Shipping" className="relative grid flex-1 grid-cols-3 rounded-xl border border-white/10 bg-white/5 p-1 sm:w-52 sm:flex-none">
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white/12 transition-transform duration-500 ease-(--ease-out-expo) motion-reduce:transition-none"
                style={{ transform: `translateX(${MODES.findIndex((m) => m.id === mode) * 100}%)` }}
              />
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={m.id === mode}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "relative z-10 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    m.id === mode ? "text-white" : "text-white/55 hover:text-white",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="relative">
              <span className="sr-only">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.currentTarget.value as Sort)}
                className="h-11 appearance-none rounded-xl border border-white/10 bg-white/5 pr-9 pl-3 text-base text-white outline-none focus:border-white/40 sm:text-sm"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id} className="bg-neutral-900">
                    {s.label}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-white/50">
                ▾
              </span>
            </label>
          </div>
        </div>

        {platforms.length > 1 ? (
          // Scrolls sideways on phones instead of wrapping into several rows.
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Platform">
            {(["all", ...platforms] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={platform === p}
                onClick={() => setPlatform(p)}
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors",
                  platform === p ? "border-white bg-white text-black" : "border-white/12 bg-white/5 text-white/75 hover:text-white",
                )}
              >
                {p === "all" ? "All platforms" : PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Results */}
      <p className="mt-6 mb-3 text-sm text-white/50" aria-live="polite">
        {shown.length === cards.length ? `${cards.length} items` : `${shown.length} of ${cards.length} items`}
      </p>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-card px-6 py-12 text-center">
          <p className="font-medium">Nothing matches that yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            We can still find it for you. Send us a link, photo or description and we&apos;ll quote it.
          </p>
          <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {filtered ? (
              <button type="button" onClick={reset} className="btn-secondary">
                Clear filters
              </button>
            ) : null}
            <Link href="/order/new" className="btn-primary">
              Request it
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {shown.map((c, i) => (
            <ProductCard key={c.id} card={c} className="batch-row-in" style={{ "--d": Math.min(i, 8) }} />
          ))}
        </div>
      )}
    </div>
  );
}
