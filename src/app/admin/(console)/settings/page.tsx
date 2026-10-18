import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { fmtDateTime } from "@/lib/format";
import { auditPage } from "@/server/admin/settings";
import { requireAdmin } from "@/server/session";
import { SETTINGS_SECTIONS } from "./sections";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsIndex() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <ul className="grid gap-3 sm:grid-cols-2">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="admin-card flex h-full items-start gap-3 p-4 transition-colors hover:border-white/25">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.label}</span>
                <span className="mt-1 block text-sm text-white/55">{s.blurb}</span>
              </span>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-white/40" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white/5" />}>
        <RecentChanges />
      </Suspense>
    </div>
  );
}

async function RecentChanges() {
  await requireAdmin();
  const { rows } = await auditPage(getDb(), 1, 8);
  return (
    <section className="admin-card p-5 text-sm">
      <h2 className="font-medium">Recent changes</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-white/50">Nothing yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <p>{r.summary}</p>
              <p className="text-xs text-white/45">
                {r.by ?? "System"} · {fmtDateTime(r.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Link href="/admin/settings/audit" className="mt-4 inline-block text-sky-300 hover:underline">
        Full change log
      </Link>
    </section>
  );
}
