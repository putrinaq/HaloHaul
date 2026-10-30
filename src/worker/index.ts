// Background worker: a separate process from the same codebase, running
// pg-boss on Postgres (no Redis). Jobs:
//   batch-auto-lock — every 5 minutes, locks open batches past their cutoff.
//   drafts-cleanup  — daily, removes cart items nobody touched for 90 days.
// Notification emails are switched off for now (see server/notify.ts).
import { PgBoss } from "pg-boss";
import { createDb, getPool } from "../db/client";
import { deleteStaleDrafts } from "../server/jobs/draftCleanup";
import { lockDueBatches } from "../server/jobs/batchLock";
import { env } from "../server/env";

const AUTO_LOCK = "batch-auto-lock";
const DRAFTS_CLEANUP = "drafts-cleanup";

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
  const db = createDb(getPool());

  await boss.createQueue(AUTO_LOCK);
  await boss.schedule(AUTO_LOCK, "*/5 * * * *", null, { tz: "Asia/Kuala_Lumpur" });
  await boss.work(AUTO_LOCK, async () => {
    const locked = await lockDueBatches(db);
    for (const b of locked) console.log(`[worker] locked ${b.code} (${b.orderCount}/${b.minOrders})${b.belowMin ? " below minimum" : ""}`);
  });
  // Cart items can hold measurements: don't keep forgotten ones.
  await boss.createQueue(DRAFTS_CLEANUP);
  await boss.schedule(DRAFTS_CLEANUP, "15 4 * * *", null, { tz: "Asia/Kuala_Lumpur" });
  await boss.work(DRAFTS_CLEANUP, async () => {
    const removed = await deleteStaleDrafts(db);
    if (removed) console.log(`[worker] removed ${removed} stale cart item${removed === 1 ? "" : "s"}`);
  });
  console.log("[worker] started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, draining…`);
    await boss.stop({ graceful: true, timeout: 20_000 });
    await getPool().end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
