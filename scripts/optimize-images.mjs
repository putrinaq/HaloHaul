// Dev-time: turns the design photos (design/photos, not in git) into small
// WebP files in public/images (committed). Pre-sizing here means the 1 GB VPS
// never resizes images at runtime (Next image optimisation is off).
//   node scripts/optimize-images.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SRC = "design/photos";
const OUT = "public/images";

/** [source, output name, width, quality] */
const JOBS = [
  ["starry-boat.png", "hero", 2000, 70],
  ["starry-boat.png", "hero-mobile", 900, 70],
  ["clothes-rack.png", "start-link", 800, 72],
  ["flower-tunnel.png", "start-photo", 800, 72],
  ["floating-dress.png", "start-digital", 800, 72],
  ["clothesline.png", "start-consult", 800, 72],
  ["courier.jpg", "step-1", 600, 72],
  ["vortex.jpg", "step-2", 600, 72],
  ["swirl-field.jpg", "step-3", 600, 72],
  ["horse-rider.jpg", "step-4", 600, 72],
  ["misty-river.png", "sign-in", 1400, 68],
  ["meadow.jpg", "meadow", 1400, 70],
];

await mkdir(OUT, { recursive: true });
for (const [src, name, width, quality] of JOBS) {
  const out = path.join(OUT, `${name}.webp`);
  const info = await sharp(path.join(SRC, src))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(out);
  console.log(`${out}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}
