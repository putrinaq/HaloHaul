// Uploads the site's own pictures and videos (public/) to the PUBLIC R2 bucket
// behind cdn.halohaul.com, and records their addresses in src/lib/assets.json.
// Run it after changing one:
//
//   ASSETS_R2_ACCOUNT_ID=… ASSETS_R2_ACCESS_KEY_ID=… ASSETS_R2_SECRET_ACCESS_KEY=… node scripts/upload-assets.mjs
//
// Names carry a fingerprint of the contents, so they can be cached for good.
// Never put anything private here: students' photos live in another bucket.
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BUCKET = "halohaul";
const FOLDERS = ["brand", "images", "videos"];
const TYPES = { ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm" };
const MANIFEST = "src/lib/assets.json";

const need = (name) => process.env[name] || (console.error(`Set ${name}`), process.exit(1));
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("ASSETS_R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: need("ASSETS_R2_ACCESS_KEY_ID"), secretAccessKey: need("ASSETS_R2_SECRET_ACCESS_KEY") },
  forcePathStyle: true,
});

const manifest = {};
for (const folder of FOLDERS) {
  for (const file of readdirSync(path.join("public", folder)).sort()) {
    const ext = path.extname(file);
    if (!TYPES[ext]) continue;
    const body = readFileSync(path.join("public", folder, file));
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 12);
    const name = `${folder}/${path.basename(file, ext)}.${hash}${ext}`;
    const Key = `Assets/${name}`;
    manifest[`/${folder}/${file}`] = `/${Key}`;

    const there = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key })).catch(() => null);
    if (there?.ContentLength === body.length) continue;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body: body, ContentType: TYPES[ext], CacheControl: "public, max-age=31536000, immutable" }));
    console.log(`uploaded ${Key} (${body.length} bytes)`);
  }
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${Object.keys(manifest).length} files in ${MANIFEST}`);
