// Fixed-window, in-memory rate limiter. One app container serves all traffic,
// so process memory is enough; limits reset on restart, which is acceptable
// for abuse throttling. (Sign-in is limited separately by Better Auth.)

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __halohaulRateLimit?: Map<string, Bucket> };
const buckets = (g.__halohaulRateLimit ??= new Map());

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const ok = bucket.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSec: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

export const LIMITS = {
  orderSubmit: { limit: 5, windowMs: 10 * 60_000 },
  uploadPresign: { limit: 30, windowMs: 10 * 60_000 },
  uploadFinalize: { limit: 30, windowMs: 10 * 60_000 },
  profileUpdate: { limit: 20, windowMs: 10 * 60_000 },
} as const;

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
}
