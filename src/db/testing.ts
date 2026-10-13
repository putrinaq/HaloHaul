// Test helper: a throwaway in-process Postgres (PGlite) with all migrations
// applied, so DB tests exercise the real constraints and triggers.
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return { client, db };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
