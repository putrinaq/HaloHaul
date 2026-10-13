// Bundles the worker, migrator and seeder into self-contained ESM files in
// dist/ so the worker image needs no node_modules and no TypeScript tooling.
import { build } from "esbuild";

await build({
  entryPoints: {
    worker: "src/worker/index.ts",
    migrate: "src/db/migrate.ts",
    seed: "src/db/seed.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  minify: false,
  // pg-native is never used; better-auth lazy-imports next/headers inside a catch.
  external: ["pg-native", "next", "next/*"],
  // Some CJS deps call require(); give the ESM bundle a real one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
