// Applies pending migrations. Bundled into the worker image and run as the
// one-shot `migrate` service before `app` and `worker` start.
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, getPool } from "./client";

async function main() {
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
  const pool = getPool();
  try {
    console.log(`[migrate] applying migrations from ${migrationsFolder}`);
    await migrate(createDb(pool), { migrationsFolder });
    console.log("[migrate] done");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
