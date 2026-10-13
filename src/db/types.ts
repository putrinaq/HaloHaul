import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Any Drizzle Postgres database with our schema (node-postgres in prod, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
