import { z } from "zod";
import { jsonError, sessionUserId } from "@/server/apiAuth";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";
import { createUploadUrl, UploadError } from "@/server/uploads";

const body = z.object({ contentType: z.string().max(100), size: z.number().int() });

export async function POST(req: Request) {
  const userId = await sessionUserId(req);
  if (!userId) return jsonError("Please sign in again.", 401);

  const limit = rateLimit(`presign:${userId}`, LIMITS.uploadPresign.limit, LIMITS.uploadPresign.windowMs);
  if (!limit.ok) return jsonError("Too many uploads. Try again shortly.", 429, { "retry-after": String(limit.retryAfterSec) });

  const store = getPhotoStore();
  if (!store) return jsonError("Photo uploads aren't configured yet.", 503);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  try {
    return Response.json(await createUploadUrl(store, userId, parsed.data));
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, err.status);
    throw err;
  }
}
