import { z } from "zod";
import { adminUserId, jsonError } from "@/server/apiAuth";
import { rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";
import { createUploadUrl, UploadError } from "@/server/uploads";

const body = z.object({ contentType: z.string().max(100), size: z.number().int() });

/** Admin image upload, step 1 (same pipeline as students; admin-only). */
export async function POST(req: Request) {
  const adminId = await adminUserId(req);
  if (!adminId) return jsonError("Not found", 404);
  if (!rateLimit(`admin-presign:${adminId}`, 120, 10 * 60_000).ok) return jsonError("Too many uploads. Try again shortly.", 429);

  const store = getPhotoStore();
  if (!store) return jsonError("Image uploads aren't configured yet.", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  try {
    return Response.json(await createUploadUrl(store, adminId, parsed.data));
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, err.status);
    throw err;
  }
}
