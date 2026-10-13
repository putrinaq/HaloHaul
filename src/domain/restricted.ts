import type { ShippingMode } from "./enums";

export interface RestrictedRule {
  keyword: string;
  /** Empty = applies to every mode. */
  appliesToModes: readonly ShippingMode[];
  /** Null = every forwarder. */
  forwarder: string | null;
  note: string | null;
}

export interface RestrictedMatch {
  keyword: string;
  note: string | null;
}

export interface RestrictedCheckInput {
  /** Free text from the order: item name, link, variant, remarks, details. */
  texts: ReadonlyArray<string | null | undefined>;
  shippingMode: ShippingMode;
  forwarder: string;
}

function normalise(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
}

/**
 * Case-insensitive keyword match. A match doesn't reject the order — it holds
 * it for admin review before any quote goes out. CJK keywords match as plain
 * substrings; Latin keywords must start at a word boundary so "magnet" doesn't
 * match "electromagnetic" mid-word but does match "magnets".
 */
export function matchRestricted(input: RestrictedCheckInput, rules: readonly RestrictedRule[]): RestrictedMatch[] {
  const haystack = normalise(input.texts.filter(Boolean).join(" \n "));
  if (!haystack) return [];

  const matches: RestrictedMatch[] = [];
  for (const rule of rules) {
    const keyword = normalise(rule.keyword.trim());
    if (!keyword) continue;
    if (rule.appliesToModes.length > 0 && !rule.appliesToModes.includes(input.shippingMode)) continue;
    if (rule.forwarder && rule.forwarder !== input.forwarder) continue;

    const isLatin = /^[\x20-\x7e]+$/.test(keyword);
    const found = isLatin
      ? new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(haystack)
      : haystack.includes(keyword);
    if (found) matches.push({ keyword: rule.keyword, note: rule.note });
  }
  return matches;
}

export function restrictedReason(matches: readonly RestrictedMatch[]): string | null {
  if (matches.length === 0) return null;
  return matches.map((m) => (m.note ? `${m.keyword}: ${m.note}` : m.keyword)).join("; ");
}

/** Every string value inside category details (for matching). */
export function detailStrings(details: Record<string, unknown>): string[] {
  return Object.values(details).filter((v): v is string => typeof v === "string");
}
