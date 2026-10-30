import { getDb } from "@/db/client";
import { helpImageKeysOf } from "@/domain/categoryApi";
import { jsonError } from "@/server/apiAuth";
import { getCatalog } from "@/server/data/categories";
import { clientIp } from "@/server/http";
import { GET_EXPIRES_S, isAdminImageKey, thumbKey } from "@/server/photos";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";

// GET /api/help-images/admin/help/<uuid>.webp (or .thumb.webp)
// A stable address for a "how to measure" picture: it redirects to a fresh
// short-lived signed URL, so API responses that mention it can be cached.
// Only pictures the published catalogue uses are served.

export async function GET(req: Request, { params }: RouteContext<"/api/help-images/[...key]">) {
  const limited = rateLimit(`api:help-images:${clientIp(req)}`, LIMITS.publicApi.limit, LIMITS.publicApi.windowMs);
  if (!limited.ok) return jsonError("Too many requests. Try again shortly.", 429, { "retry-after": String(limited.retryAfterSec) });

  const key = (await params).key.join("/");
  const original = key.replace(/\.thumb\.webp$/, ".webp");
  const isThumb = original !== key;
  if (!isAdminImageKey(original) || !original.startsWith("admin/help/")) return jsonError("Not found.", 404);
  if (!helpImageKeysOf(await getCatalog(getDb())).has(original)) return jsonError("Not found.", 404);

  const store = getPhotoStore();
  if (!store) return jsonError("Images aren't available right now.", 503);
  const url = await store.presignGet(isThumb ? thumbKey(original) : original, GET_EXPIRES_S);
  // The signed URL lasts GET_EXPIRES_S; let browsers reuse the redirect for half that.
  return new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": `private, max-age=${Math.floor(GET_EXPIRES_S / 2)}` },
  });
}
