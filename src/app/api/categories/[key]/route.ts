import { getDb } from "@/db/client";
import { categoryDetail, helpImagePath } from "@/domain/categoryApi";
import { jsonError } from "@/server/apiAuth";
import { getCatalog } from "@/server/data/categories";
import { clientIp, jsonWithEtag } from "@/server/http";
import { isAdminImageKey } from "@/server/photos";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";

// GET /api/categories/[key]
// One category's published form: the definition, the measurement library
// entries it uses, the resolved fields in order, and help picture URLs. The
// order form renders and validates from this, and the server validates the
// submitted order against the same definition.

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export async function GET(req: Request, { params }: RouteContext<"/api/categories/[key]">) {
  const limited = rateLimit(`api:categories:${clientIp(req)}`, LIMITS.publicApi.limit, LIMITS.publicApi.windowMs);
  if (!limited.ok) return jsonError("Too many requests. Try again shortly.", 429, { "retry-after": String(limited.retryAfterSec) });

  const { key } = await params;
  if (!KEY_RE.test(key)) return jsonError("No such category.", 404);

  const store = getPhotoStore();
  const detail = categoryDetail(await getCatalog(getDb()), key, (imageKey) =>
    store && isAdminImageKey(imageKey) ? helpImagePath(imageKey) : null,
  );
  if (!detail) return jsonError("No such category.", 404);
  return jsonWithEtag(req, detail, { cacheControl: "public, no-cache" });
}
