import { createHash } from "node:crypto";

// Small helpers for public JSON route handlers.

/**
 * The caller's IP for rate limiting. The reverse proxy (nginx/Caddy) puts the
 * real client first in X-Forwarded-For; direct requests in dev have none.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** A weak ETag from the response body: same JSON, same tag. */
export function etagOf(body: string): string {
  return `W/"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
}

/** True when the request's If-None-Match already names this ETag (weak comparison). */
export function notModified(req: Request, etag: string): boolean {
  const header = req.headers.get("if-none-match");
  if (!header) return false;
  if (header.trim() === "*") return true;
  const bare = (t: string) => t.trim().replace(/^W\//, "");
  return header.split(",").some((t) => bare(t) === bare(etag));
}

/**
 * JSON with an ETag. A repeat request that sends the tag back gets an empty
 * 304, so a client can revalidate on every use for the cost of a header.
 */
export function jsonWithEtag(req: Request, data: unknown, { cacheControl }: { cacheControl: string }): Response {
  const body = JSON.stringify(data);
  const etag = etagOf(body);
  const headers = { etag, "cache-control": cacheControl };
  if (notModified(req, etag)) return new Response(null, { status: 304, headers });
  return new Response(body, { status: 200, headers: { ...headers, "content-type": "application/json; charset=utf-8" } });
}
