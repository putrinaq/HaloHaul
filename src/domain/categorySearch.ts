// Category search for the order form's combobox and GET /api/categories?q=.
// The same function runs in the browser and on the server, so the API and the
// form always rank the same way.
//
// Ranking, best first:
//   1. how many of the query's words matched something (students often type a
//      whole product title, e.g. "nike air force shoes": only "shoes" matters);
//   2. how well they matched: exact word > start of a word > inside a word >
//      one typo away, with the name counting more than a search word (alias);
//   3. the admin's display order.

export interface SearchableCategory {
  key: string;
  name: string;
  /** Other words students search for it by, e.g. "kasut", "鞋". */
  aliases: readonly string[];
}

export interface CategoryMatch<T> {
  item: T;
  score: number;
  /** The search word that matched, when the name itself didn't. Shown as "Also: kasut". */
  via: string | null;
  /** [start, end) ranges of the name to highlight. */
  highlight: Array<[number, number]>;
}

/** Longest query we look at, and the most words in it. */
export const MAX_QUERY_LENGTH = 80;
const MAX_QUERY_WORDS = 8;

export const MAX_ALIASES = 30;
export const MAX_ALIAS_LENGTH = 40;

/** Search words as typed in the admin ("kasut, 鞋、sneakers"): split, trimmed, deduplicated. */
export function parseAliases(text: string): string[] {
  return cleanAliases(text.split(/[,，、;\n]/));
}

/**
 * Trimmed, inner spaces collapsed, empties and near-duplicates dropped (two
 * words that search the same, like "Kasut" and "kasut", keep the first).
 */
export function cleanAliases(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const word = raw.trim().replace(/\s+/g, " ").slice(0, MAX_ALIAS_LENGTH);
    const norm = normalizeForSearch(word);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(word);
    if (out.length === MAX_ALIASES) break;
  }
  return out;
}

/** Lowercase, accents and punctuation removed, full-width characters folded, single spaces. */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Scripts without spaces between words (Chinese, Japanese): match anywhere. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Optimal string alignment distance, stopping early once it can't be ≤ 1. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const prev2 = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur.push(d);
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > 1) return false;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length] <= 1;
}

/** How well one query word matches a text: 0 (not at all) to 10 (a whole word). */
function wordScore(token: string, text: string, words: readonly string[]): number {
  if (words.includes(token)) return 10;
  if (words.some((w) => w.startsWith(token))) return 7;
  if ((token.length >= 3 || CJK.test(token)) && text.includes(token)) return 4;
  if (token.length >= 4 && words.some((w) => w.length >= 4 && withinOneEdit(token, w))) return 3;
  return 0;
}

const NAME_WEIGHT = 3;
const ALIAS_WEIGHT = 2;
const KEY_WEIGHT = 1;

interface Prepared {
  name: string;
  nameWords: string[];
  key: string;
  keyWords: string[];
  aliases: Array<{ original: string; text: string; words: string[] }>;
}

function prepare(c: SearchableCategory): Prepared {
  const name = normalizeForSearch(c.name);
  const key = normalizeForSearch(c.key.replace(/_/g, " "));
  return {
    name,
    nameWords: name.split(" "),
    key,
    keyWords: key.split(" "),
    aliases: c.aliases
      .map((a) => ({ original: a, text: normalizeForSearch(a) }))
      .filter((a) => a.text)
      .map((a) => ({ ...a, words: a.text.split(" ") })),
  };
}

/** Where each query word appears in the (lowercased) name, merged into ranges. */
function highlightRanges(name: string, tokens: readonly string[]): Array<[number, number]> {
  const lower = name.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const t of tokens) {
    // Prefer the start of a word ("dre" in "Dress"), else anywhere.
    const wordStart = new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").exec(lower);
    const at = wordStart ? wordStart.index + wordStart[1].length : lower.indexOf(t);
    if (at >= 0) ranges.push([at, at + t.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/**
 * Categories matching `query`, best first. An empty query returns everything
 * in the given (display) order. `limit` caps the number of results.
 */
export function searchCategories<T extends SearchableCategory>(items: readonly T[], query: string, limit = Infinity): Array<CategoryMatch<T>> {
  const q = normalizeForSearch(query.slice(0, MAX_QUERY_LENGTH));
  if (!q) return items.slice(0, limit).map((item) => ({ item, score: 0, via: null, highlight: [] }));
  const tokens = [...new Set(q.split(" "))].slice(0, MAX_QUERY_WORDS);

  const results: Array<CategoryMatch<T> & { matched: number; order: number }> = [];
  items.forEach((item, order) => {
    const p = prepare(item);
    let matched = 0;
    let score = 0;
    let nameHit = false;
    const aliasHits = new Map<string, number>();
    for (const t of tokens) {
      const byName = wordScore(t, p.name, p.nameWords) * NAME_WEIGHT;
      const byKey = wordScore(t, p.key, p.keyWords) * KEY_WEIGHT;
      let byAlias = 0;
      let bestAlias: string | null = null;
      for (const a of p.aliases) {
        const s = wordScore(t, a.text, a.words) * ALIAS_WEIGHT;
        if (s > byAlias) [byAlias, bestAlias] = [s, a.original];
      }
      const best = Math.max(byName, byKey, byAlias);
      if (best === 0) continue;
      matched += 1;
      score += best;
      if (byName > 0 && byName >= byAlias) nameHit = true;
      else if (bestAlias && byAlias === best) aliasHits.set(bestAlias, (aliasHits.get(bestAlias) ?? 0) + byAlias);
    }
    if (matched === 0) return;

    // The whole query naming the category outright beats word-by-word matches.
    if (p.name === q) score += 50;
    else if (p.name.startsWith(q)) score += 20;
    if (p.aliases.some((a) => a.text === q)) score += 30;

    const via = nameHit || aliasHits.size === 0 ? null : [...aliasHits].sort((a, b) => b[1] - a[1])[0][0];
    results.push({ item, score, via, highlight: nameHit ? highlightRanges(item.name, tokens) : [], matched, order });
  });

  results.sort((a, b) => b.matched - a.matched || b.score - a.score || a.order - b.order);
  return results.slice(0, limit).map(({ item, score, via, highlight }) => ({ item, score, via, highlight }));
}
