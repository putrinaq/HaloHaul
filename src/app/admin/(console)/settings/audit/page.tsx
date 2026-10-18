import type { Metadata } from "next";
import { Suspense } from "react";
import { Pagination } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { fmtDateTime } from "@/lib/format";
import { auditPage } from "@/server/admin/settings";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Change log" };

export default function AuditPage({ searchParams }: PageProps<"/admin/settings/audit">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <AuditList searchParams={searchParams} />
    </Suspense>
  );
}

async function AuditList({ searchParams }: { searchParams: PageProps<"/admin/settings/audit">["searchParams"] }) {
  await requireAdmin();
  const page = Math.max(1, Number.parseInt(String((await searchParams).page ?? "1"), 10) || 1);
  const { rows, pageCount } = await auditPage(getDb(), page);
  return (
    <div>
      <ul className="admin-card divide-y divide-white/10 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="w-44 shrink-0 text-xs text-white/45 tabular-nums">{fmtDateTime(r.createdAt)}</span>
            <span className="flex-1">{r.summary}</span>
            <span className="text-xs text-white/55">{r.by ?? "System"}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="p-4 text-white/50">No changes logged yet.</li> : null}
      </ul>
      <Pagination page={page} pageCount={pageCount} href={(p) => `/admin/settings/audit?page=${p}`} />
    </div>
  );
}
