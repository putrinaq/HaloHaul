import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { fmtDateTime } from "@/lib/format";
import { fxHistory } from "@/server/admin/settings";
import { getSettings } from "@/server/data/catalog";
import { requireAdmin } from "@/server/session";
import { FxForm } from "../forms";

export const metadata: Metadata = { title: "Exchange rate" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  const db = getDb();
  const [settings, history] = await Promise.all([getSettings(db), fxHistory(db)]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FxForm settings={settings} />
      <section className="admin-card p-5 text-sm">
        <h2 className="font-medium">History</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-white/50">No changes yet. The first rate you save starts the history.</p>
        ) : (
          <ol className="mt-3 divide-y divide-white/10">
            {history.map((h) => (
              <li key={h.id} className="flex items-baseline gap-3 py-2">
                <span className="font-medium tabular-nums">{Number(h.myrPerCny).toFixed(4)}</span>
                <span className="flex-1 text-white/55">{h.note}</span>
                <span className="text-xs text-white/45">
                  {h.by ?? "System"} · {fmtDateTime(h.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
