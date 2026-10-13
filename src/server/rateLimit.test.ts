import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rateLimit";

beforeEach(() => resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit within a window, then refuses", () => {
    const t = 1_000_000;
    expect(rateLimit("k", 2, 60_000, t)).toEqual({ ok: true, remaining: 1, retryAfterSec: 0 });
    expect(rateLimit("k", 2, 60_000, t + 1)).toEqual({ ok: true, remaining: 0, retryAfterSec: 0 });
    expect(rateLimit("k", 2, 60_000, t + 30_000)).toEqual({ ok: false, remaining: 0, retryAfterSec: 30 });
  });

  it("resets after the window", () => {
    const t = 1_000_000;
    rateLimit("k", 1, 60_000, t);
    expect(rateLimit("k", 1, 60_000, t + 1).ok).toBe(false);
    expect(rateLimit("k", 1, 60_000, t + 60_000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    rateLimit("a", 1, 60_000, 0);
    expect(rateLimit("b", 1, 60_000, 0).ok).toBe(true);
  });
});
