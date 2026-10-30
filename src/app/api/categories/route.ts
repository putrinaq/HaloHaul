import { z } from "zod";
import { getDb } from "@/db/client";
import { categoryList, MAX_LIST_LIMIT } from "@/domain/categoryApi";
import { MAX_QUERY_LENGTH } from "@/domain/categorySearch";
import { jsonError } from "@/server/apiAuth";
import { getCatalog } from "@/server/data/categories";
import { clientIp, jsonWithEtag } from "@/server/http";
import { LIMITS, rateLimit } from "@/server/rateLimit";

// GET /api/categories?q=&limit=
// Every orderable category with the measurements it asks for; with `q`, only
// the matches, best first. Public: categories aren't personal data. Responses
// carry an ETag, so revalidating costs a 304 until the admin changes something.

const query = z.object({
  q: z.string().max(MAX_QUERY_LENGTH, `Keep the search under ${MAX_QUERY_LENGTH} characters.`).default(""),
  limit: z.coerce
    .number({ error: "limit must be a number" })
    .int("limit must be a whole number")
    .min(1, "limit must be at least 1")
    .max(MAX_LIST_LIMIT, `limit can be at most ${MAX_LIST_LIMIT}`)
    .default(MAX_LIST_LIMIT),
});

export async function GET(req: Request) {
  const limited = rateLimit(`api:categories:${clientIp(req)}`, LIMITS.publicApi.limit, LIMITS.publicApi.windowMs);
  if (!limited.ok) return jsonError("Too many requests. Try again shortly.", 429, { "retry-after": String(limited.retryAfterSec) });

  const params = new URL(req.url).searchParams;
  const parsed = query.safeParse({ q: params.get("q") ?? undefined, limit: params.get("limit") ?? undefined });
  if (!parsed.success) return jsonError(parsed.error.issues[0].message, 400);

  const catalog = await getCatalog(getDb());
  return jsonWithEtag(req, categoryList(catalog, parsed.data.q, parsed.data.limit), { cacheControl: "public, no-cache" });
}
