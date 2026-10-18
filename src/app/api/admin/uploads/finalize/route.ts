import { z } from "zod";
import { adminUserId, jsonError } from "@/server/apiAuth";
import { GET_EXPIRES_S, thumbKey } from "@/server/photos";
import { rateLimit } from "@/server/rateLimit";
import { getPhotoStore } from "@/server/storage";
import { ADMIN_UPLOAD_PURPOSES, finalizeUpload, UploadError } from "@/server/uploads";

const body = z.object({ key: z.string().max(300), purpose: z.enum(ADMIN_UPLOAD_PURPOSES) });

/** Admin image upload, step 2: re-encode and file under admin/{purpose}/. */
export async function POST(req: Request) {
  const adminId = await adminUserId(req);
  if (!adminId) return jsonError("Not found", 404);
  if (!rateLimit(`admin-finalize:${adminId}`, 120, 10 * 60_000).ok) return jsonError("Too many uploads. Try again shortly.", 429);

  const store = getPhotoStore();
  if (!store) return jsonError("Image uploads aren't configured yet.", 503);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.", 400);

  try {
    const { key } = await finalizeUpload(store, adminId, parsed.data.key, parsed.data.purpose);
    return Response.json({ key, previewUrl: await store.presignGet(thumbKey(key), GET_EXPIRES_S) });
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.message, err.status);
    throw err;
  }
}
