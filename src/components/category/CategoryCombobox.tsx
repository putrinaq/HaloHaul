"use client";

import { Check, ChevronDown, LoaderCircle, RotateCw, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CategoryIcon } from "@/components/admin/CategoryIcon";
import type { CategoryListItem } from "@/domain/categoryApi";
import { searchCategories } from "@/domain/categorySearch";
import { cn } from "@/lib/utils";

// A searchable category picker (the "Select2" kind), built on the WAI-ARIA
// combobox pattern: type to filter, arrow keys to move, Enter to pick, Escape
// to close. It ranks with the same searchCategories as GET /api/categories.

export interface CategoryComboboxProps {
  id: string;
  /** Selected category key, or "". */
  value: string;
  onChange: (key: string) => void;
  /** Null while the list is loading or failed. */
  categories: CategoryListItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  invalid?: boolean;
  /** Ids of the hint/error text, for aria-describedby. */
  describedBy?: string;
  /** Offered under every search, so there's always a way forward (e.g. "other"). */
  fallbackKey?: string;
  /** A category got the highlight: a good moment to prefetch its form. */
  onHighlight?: (key: string) => void;
  placeholder?: string;
}

/** "Chest · Shoulder width · Arm length +1 more", or what else the form asks. */
export function measurementSummary(c: Pick<CategoryListItem, "measurements" | "fieldCount">): string {
  const labels = c.measurements.map((m) => m.label);
  if (labels.length === 0) return c.fieldCount > 0 ? `${c.fieldCount} detail${c.fieldCount === 1 ? "" : "s"} to fill in` : "Nothing to fill in";
  const shown = labels.slice(0, 3).join(" · ");
  return labels.length > 3 ? `${shown} +${labels.length - 3} more` : shown;
}

function Highlighted({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-sm bg-sky-400/20 text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

interface Row {
  item: CategoryListItem;
  via: string | null;
  highlight: Array<[number, number]>;
  /** The fallback shown under the real matches. */
  fallback?: boolean;
}

export function CategoryCombobox(props: CategoryComboboxProps) {
  const { id, value, onChange, categories, loading, error, onRetry, invalid, describedBy, fallbackKey, onHighlight } = props;
  const listboxId = `${id}-listbox`;
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = useMemo(() => categories?.find((c) => c.key === value) ?? null, [categories, value]);

  const rows: Row[] = useMemo(() => {
    if (!categories) return [];
    const matches: Row[] = searchCategories(categories, query).map((m) => ({ item: m.item, via: m.via, highlight: m.highlight }));
    if (query.trim() && fallbackKey && !matches.some((r) => r.item.key === fallbackKey)) {
      const fallback = categories.find((c) => c.key === fallbackKey);
      if (fallback) matches.push({ item: fallback, via: null, highlight: [], fallback: true });
    }
    return matches;
  }, [categories, query, fallbackKey]);
  const realMatches = rows.filter((r) => !r.fallback).length;
  const activeRow = open ? rows[Math.min(active, rows.length - 1)] : undefined;
  const activeKey = activeRow?.item.key;
  const optionId = (key: string) => `${id}-option-${key}`;

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (activeKey) document.getElementById(`${id}-option-${activeKey}`)?.scrollIntoView({ block: "nearest" });
  }, [id, activeKey]);

  function highlight(index: number) {
    setActive(index);
    const row = rows[index];
    if (row) onHighlight?.(row.item.key);
  }

  function openList() {
    if (open) return;
    setOpen(true);
    setQuery("");
    // Start on the current choice, so Enter keeps it.
    const at = categories?.findIndex((c) => c.key === value) ?? -1;
    highlight(at >= 0 ? at : 0);
    // On phones, lift the field to the top so the list isn't hidden by the keyboard.
    if (window.matchMedia("(max-width: 639px)").matches) inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    onChange(row.item.key);
    close();
    inputRef.current?.focus();
  }

  function move(by: number) {
    if (!open) return openList();
    if (rows.length === 0) return;
    highlight((Math.min(active, rows.length - 1) + by + rows.length) % rows.length);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (e.altKey) openList();
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "PageDown":
        if (open) {
          e.preventDefault();
          highlight(Math.min(rows.length - 1, active + 5));
        }
        break;
      case "PageUp":
        if (open) {
          e.preventDefault();
          highlight(Math.max(0, active - 5));
        }
        break;
      case "Enter":
        // Never submit the whole order from here.
        e.preventDefault();
        if (open) choose(activeRow);
        else openList();
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  }

  const shownText = open ? query : (selected?.name ?? "");
  const resultsText = !categories
    ? ""
    : query.trim()
      ? realMatches === 0
        ? `No category matches “${query.trim()}”.`
        : `${realMatches} ${realMatches === 1 ? "category matches" : "categories match"}.`
      : `${categories.length} categories.`;

  return (
    <div className="relative">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          {!open && selected ? <CategoryIcon name={selected.icon} className="size-4 text-foreground" /> : <Search className="size-4" />}
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeRow ? optionId(activeRow.item.key) : undefined}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(" ") || undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          value={shownText}
          placeholder={open && selected ? selected.name : (props.placeholder ?? "Search categories, e.g. shoes, kasut, 鞋")}
          onFocus={openList}
          onClick={openList}
          onBlur={close}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-11 w-full scroll-mt-28 rounded-lg border border-input bg-transparent pr-10 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
            open && selected && "placeholder:text-foreground/60",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close the list" : "Show all categories"}
          // Keep focus in the input; clicking toggles the list.
          onMouseDown={(e) => {
            e.preventDefault();
            if (open) close();
            else inputRef.current?.focus();
          }}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {/* Result count and load state, read out as they change. */}
      <p id={statusId} role="status" className="sr-only">
        {loading ? "Loading categories." : error ? error : open ? resultsText : ""}
      </p>

      {error && !loading ? (
        <p className="mt-2 flex items-center gap-3 text-sm text-destructive">
          {error}
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-foreground underline underline-offset-2">
            <RotateCw className="size-3.5" aria-hidden />
            Try again
          </button>
        </p>
      ) : null}

      <div
        hidden={!open}
        // Clicks inside the panel must not blur the input first.
        onMouseDown={(e) => e.preventDefault()}
        className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/12 bg-neutral-950/95 shadow-[0_20px_50px_-12px_rgb(0_0_0/0.9)] backdrop-blur-xl"
      >
        {loading ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading categories…
          </p>
        ) : null}
        {categories && query.trim() && realMatches === 0 ? (
          <p className="px-4 pt-3 pb-1 text-sm text-muted-foreground">No category matches “{query.trim()}”.</p>
        ) : null}
        <ul id={listboxId} role="listbox" aria-label="Categories" className="max-h-[min(22rem,50dvh)] overflow-y-auto overscroll-contain p-1.5">
          {rows.map((row, i) => {
            const isActive = activeRow?.item.key === row.item.key;
            const isSelected = row.item.key === value;
            return (
              <li
                key={row.item.key}
                id={optionId(row.item.key)}
                role="option"
                aria-selected={isSelected}
                onMouseMove={() => (active !== i ? highlight(i) : undefined)}
                onClick={() => choose(row)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5",
                  row.fallback && "mt-1.5 border-t border-white/8 pt-3",
                  isActive && "bg-white/10",
                )}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                  <CategoryIcon name={row.item.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {row.fallback ? <span className="font-normal text-muted-foreground">Can&apos;t find it? </span> : null}
                    <Highlighted text={row.item.name} ranges={row.highlight} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.via ? (
                      <>
                        Also: <span className="text-foreground/80">{row.via}</span> ·{" "}
                      </>
                    ) : null}
                    {measurementSummary(row.item)}
                  </span>
                </span>
                {isSelected ? <Check className="size-4 shrink-0 text-sky-300" aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
