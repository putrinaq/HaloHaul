// End-to-end test server: a fresh in-process Postgres (PGlite) in a temp
// folder, migrated and seeded with demo data, then the production build
// (`npm run build` first) on port 3200. Everything is thrown away on exit.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const DB_PORT = 5544;
const APP_PORT = 3200;
// On Windows the runner kills this process outright, so clear old runs first.
for (const d of readdirSync(tmpdir())) if (d.startsWith("halohaul-e2e-")) rmSync(path.join(tmpdir(), d), { recursive: true, force: true });
const dataDir = mkdtempSync(path.join(tmpdir(), "halohaul-e2e-"));
const env = {
  ...process.env,
  DATABASE_URL: `postgres://e2e:e2e@localhost:${DB_PORT}/e2e`,
  // PGlite is one connection underneath; concurrent clients interleave
  // extended-protocol messages ("portal does not exist").
  DATABASE_POOL_MAX: "1",
  APP_URL: `http://localhost:${APP_PORT}`,
  BETTER_AUTH_SECRET: "e2e-only-secret-not-for-real-use-0123456789abcdef",
  RESEND_API_KEY: "re_e2e_dummy",
  ADMIN_EMAIL: "e2e-admin@example.com",
  ADMIN_PASSWORD: "e2e-admin-password",
  ADMIN_NAME: "Test Admin",
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET: "",
};
const children = [];
// Each tool's JS entry point, run with this node (no shell, works on Windows).
const BIN = {
  pglite: "node_modules/@electric-sql/pglite-socket/dist/scripts/server.js",
  tsx: "node_modules/tsx/dist/cli.mjs",
  next: "node_modules/next/dist/bin/next",
};
const node = (bin, args, extraEnv = {}) => spawn(process.execPath, [path.resolve(BIN[bin]), ...args], { env: { ...env, ...extraEnv }, stdio: "inherit" });

function run(bin, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    node(bin, args, extraEnv).on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} ${args.join(" ")} exited ${code}`))));
  });
}

function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tryOnce = () => {
      const s = net.connect(port, "127.0.0.1", () => (s.end(), resolve()));
      s.on("error", () => (Date.now() - started > 30_000 ? reject(new Error(`port ${port} never opened`)) : setTimeout(tryOnce, 300)));
    };
    tryOnce();
  });
}

function shutdown(code = 0) {
  for (const c of children) c.kill();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
  process.exit(code);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

try {
  children.push(node("pglite", [`--db=${dataDir}`, `--port=${DB_PORT}`, "--max-connections=10"]));
  await waitForPort(DB_PORT);
  await run("tsx", ["src/db/migrate.ts"]);
  // Demo data is refused in production, so the seed runs as development.
  await run("tsx", ["src/db/seed.ts", "--demo"], { NODE_ENV: "development" });
} catch (err) {
  console.error(err);
  shutdown(1);
}

const app = node("next", ["start", "-p", String(APP_PORT)], { NODE_ENV: "production" });
children.push(app);
app.on("exit", (code) => shutdown(code ?? 0));
