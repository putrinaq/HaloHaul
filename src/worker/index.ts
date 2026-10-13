// Background worker: a separate process from the same codebase, running
// pg-boss on Postgres (no Redis). Jobs are registered in later phases:
//   notifications (Phase 3), batch auto-lock / quote expiry (Phase 4),
//   admin daily digest (Phase 3).
import { PgBoss } from "pg-boss";
import { env } from "../server/env";

async function main() {
  const e = env();
  const boss = new PgBoss({
    connectionString: e.DATABASE_URL,
    application_name: "halohaul-worker",
    // Keep the footprint small: Postgres max_connections is 20 in total.
    max: 3,
  });
  boss.on("error", (err) => console.error("[worker] pg-boss error", err));

  await boss.start();
  console.log("[worker] started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, draining…`);
    await boss.stop({ graceful: true, timeout: 20_000 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
