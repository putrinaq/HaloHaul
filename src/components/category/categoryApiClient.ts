"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryDetailResponse, CategoryListItem, CategoryListResponse } from "@/domain/categoryApi";

// Browser side of the category API. Loads are shared and cached for a few
// minutes, so switching back to a category is instant and two components
// asking at once make one request. The server's ETags make each refresh a 304
// when nothing changed.

const TTL_MS = 5 * 60_000;

export class CategoryApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CategoryApiError";
  }
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new CategoryApiError("You seem to be offline. Check your connection and try again.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new CategoryApiError(body?.error ?? "Couldn't load categories. Try again.", res.status);
  return body;
}

interface Entry<T> {
  promise: Promise<T>;
  at: number;
}

function cached<T>(cache: Map<string, Entry<T>>, key: string, load: () => Promise<T>, fresh: boolean): Promise<T> {
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = load();
  cache.set(key, { promise, at: Date.now() });
  // A failed load isn't kept, so the next attempt tries again.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

const lists = new Map<string, Entry<CategoryListItem[]>>();
const details = new Map<string, Entry<CategoryDetailResponse>>();

/** Every orderable category with its measurements, in display order. */
export function loadCategoryList({ fresh = false } = {}): Promise<CategoryListItem[]> {
  return cached(lists, "all", () => getJson<CategoryListResponse>("/api/categories").then((r) => r.categories), fresh);
}

/** One category's form. `fresh` skips the cache (e.g. after the server says the form changed). */
export function loadCategoryDetail(key: string, { fresh = false } = {}): Promise<CategoryDetailResponse> {
  return cached(details, key, () => getJson<CategoryDetailResponse>(`/api/categories/${encodeURIComponent(key)}`), fresh);
}

/** Start loading a category before it's picked (on hover or arrow-key highlight). */
export function prefetchCategoryDetail(key: string): void {
  loadCategoryDetail(key).catch(() => {});
}

export type Loadable<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

type Settled<T> = { for: string; data: T; error: null } | { for: string; data: null; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** The category list, loaded once per page; `retry` after an error. */
export function useCategoryList(): Loadable<CategoryListItem[]> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<CategoryListItem[]> | null>(null);
  useEffect(() => {
    let live = true;
    const tag = String(attempt);
    loadCategoryList({ fresh: attempt > 0 }).then(
      (data) => live && setSettled({ for: tag, data, error: null }),
      (e: unknown) => live && setSettled({ for: tag, data: null, error: message(e) }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const current = settled?.for === String(attempt) ? settled : null;
  if (!current) return { status: "loading", data: null, error: null, retry };
  return current.error === null
    ? { status: "ready", data: current.data, error: null, retry }
    : { status: "error", data: null, error: current.error, retry };
}

/**
 * The form for `key` (idle with no key). Switching keys never shows the
 * previous category's form: a late answer for an old key is ignored.
 */
export function useCategoryDetail(key: string): (Loadable<CategoryDetailResponse> | { status: "idle"; data: null; error: null }) & {
  retry: () => void;
  refresh: () => void;
} {
  // `freshKey`: the category a refresh asked for; others still use the cache.
  const [attempt, setAttempt] = useState<{ n: number; freshKey: string | null }>({ n: 0, freshKey: null });
  const [settled, setSettled] = useState<Settled<CategoryDetailResponse> | null>(null);
  const tag = `${key}#${attempt.n}`;
  const fresh = attempt.freshKey === key;
  useEffect(() => {
    if (!key) return;
    let live = true;
    loadCategoryDetail(key, { fresh }).then(
      (data) => live && setSettled({ for: tag, data, error: null }),
      (e: unknown) => live && setSettled({ for: tag, data: null, error: message(e) }),
    );
    return () => {
      live = false;
    };
  }, [key, fresh, tag]);
  const retry = useCallback(() => setAttempt((a) => ({ n: a.n + 1, freshKey: null })), []);
  const refresh = useCallback(() => setAttempt((a) => ({ n: a.n + 1, freshKey: key })), [key]);
  if (!key) return { status: "idle", data: null, error: null, retry, refresh };
  const current = settled?.for === tag ? settled : null;
  if (!current) return { status: "loading", data: null, error: null, retry, refresh };
  return current.error === null
    ? { status: "ready", data: current.data, error: null, retry, refresh }
    : { status: "error", data: null, error: current.error, retry, refresh };
}
