import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../server/env";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

// One pool per process. In dev, Next's hot reload re-evaluates modules, so the
// pool is parked on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __halohaulPool?: Pool; __halohaulDb?: Database };

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
  globalForDb.__halohaulDb ??= createDb(getPool());
  return globalForDb.__halohaulDb;
}
