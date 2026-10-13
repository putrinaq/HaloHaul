import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  // pg-boss owns the `pgboss` schema; keep drizzle-kit out of it.
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://halohaul:halohaul@localhost:5432/halohaul",
  },
  strict: true,
  verbose: true,
});
