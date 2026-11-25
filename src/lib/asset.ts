import manifest from "./assets.json";

export const ASSET_ORIGIN = "https://cdn.halohaul.com";

/**
 * Address of a file in public/: the CDN in production, the local copy in
 * development. Run scripts/upload-assets.mjs after changing one.
 */
export function asset(path: keyof typeof manifest): string {
  return process.env.NODE_ENV === "production" ? ASSET_ORIGIN + manifest[path] : path;
}
