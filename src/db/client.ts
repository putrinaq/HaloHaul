import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../server/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

// One pool per process. In dev, Next's hot reload re-evaluates modules, so the
// pool is parked on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __halohaulPool?: Pool; __halohaulDb?: Database; __halohaulDbSchema?: unknown };

export function createDb(pool: Pool): Database {
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

export function getPool(): Pool {
  if (!globalForDb.__halohaulPool) {
    const e = env();
    globalForDb.__halohaulPool = new Pool({
      connectionString: e.DATABASE_URL,
      max: e.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForDb.__halohaulPool;
}

export function getDb(): Database {
  // The pool survives hot reloads, but the Drizzle wrapper is rebuilt whenever
  // the schema module is re-evaluated (a schema edit in dev), so it never
  // queries with stale table definitions.
  if (!globalForDb.__halohaulDb || globalForDb.__halohaulDbSchema !== schema) {
    globalForDb.__halohaulDb = createDb(getPool());
    globalForDb.__halohaulDbSchema = schema;
  }
  return globalForDb.__halohaulDb;
}
