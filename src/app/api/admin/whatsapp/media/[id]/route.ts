import { z } from "zod";
import { getDb } from "@/db/client";
import { isInlineMime } from "@/domain/whatsapp";
import { adminUserId, jsonError } from "@/server/apiAuth";
import { getPhotoStore } from "@/server/storage";
import { whatsappGateway } from "@/server/whatsapp/gateway";
import { mediaFile } from "@/server/whatsapp/inbox";

/**
 * A file a customer sent. Strangers can send anything, so only plain photo,
 * audio and video types are shown; the rest can only be downloaded.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/admin/whatsapp/media/[id]">) {
  if (!(await adminUserId(req))) return jsonError("Not found", 404);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return jsonError("Not found", 404);
  const file = await mediaFile(getDb(), whatsappGateway(), getPhotoStore(), id);
  if (!file) return jsonError("That file isn't available any more.", 404);

  const inline = isInlineMime(file.mime);
  // encodeURIComponent leaves ' ( ) * alone, and they aren't allowed here.
  const name = encodeURIComponent(file.name ?? "whatsapp-file").replace(/['()*]/g, "_");
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": inline ? file.mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "private, max-age=3600",
    },
  });
}
