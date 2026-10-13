import { z } from "zod";
import { jsonError, sessionUserId } from "@/server/apiAuth";
import { LIMITS, rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";
import { GET_EXPIRES_S } from "@/server/photos";
import { finalizeUpload, UploadError } from "@/server/uploads";

const body = z.object({ key: z.string().max(300) });

export async function POST(req: Request) {
  const userId = await sessionUserId(req);
  if (!userId) return jsonError("Please sign in again.", 401);

  const limit = rateLimit(`finalize:${userId}`, LIMITS.uploadFinalize.limit, LIMITS.uploadFinalize.windowMs);
  if (!limit.ok) return jsonError("Too many uploads. Try again shortly.", 429, { "retry-after": String(limit.retryAfterSec) });

  const store = getPhotoStore();
  if (!store) return jsonError("Photo uploads aren't configured yet.", 503);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  try {
    const { key } = await finalizeUpload(store, userId, parsed.data.key);
    return Response.json({ key, previewUrl: await store.presignGet(key, GET_EXPIRES_S) });
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, err.status);
    throw err;
  }
}
