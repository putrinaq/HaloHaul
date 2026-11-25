/**
 * Browser upload in three steps: ask our API for a presigned URL, PUT the file
 * straight to storage, then have the API finalise it (re-encode, verify). The
 * student and admin upload APIs share this shape under different base paths.
 */
export async function uploadImage(
  file: File,
  base: "/api/uploads" | "/api/admin/uploads",
  extra: Record<string, unknown> = {},
): Promise<{ key: string; previewUrl: string }> {
  const presign = await fetch(`${base}/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  const p = await presign.json();
  if (!presign.ok) throw new Error(p.error ?? "Upload failed");

  // If storage can't be reached at all (offline, bad config, missing bucket
  // CORS) fetch throws a raw browser message like "NetworkError when
  // attempting to fetch resource"; show a plain one.
  let put: Response;
  try {
    put = await fetch(p.url, { method: "PUT", headers: p.headers, body: file });
  } catch {
    throw new Error("We couldn't reach our photo storage. Check your connection and try again.");
  }
  if (!put.ok) throw new Error("Upload failed. Check your connection and try again.");

  const fin = await fetch(`${base}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: p.key, ...extra }),
  });
  const f = await fin.json();
  if (!fin.ok) throw new Error(f.error ?? "Upload failed");
  return { key: f.key, previewUrl: f.previewUrl };
}
