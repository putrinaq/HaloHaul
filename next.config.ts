import path from "node:path";
import type { NextConfig } from "next";

// The repo root; pinned because a parent folder (D:/project) has its own lockfile.
const root = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image; built in CI, never on the VPS.
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingRoot: root,
  // sharp loads native libvips files that tracing misses. Only the upload
  // finalize route uses sharp (lazily), so only it carries them.
  outputFileTracingIncludes: {
    "/api/uploads/finalize": ["./node_modules/@img/**/*"],
  },
  turbopack: {
    root,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
