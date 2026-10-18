import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { listRestricted } from "@/server/admin/settings";
import { requireAdmin } from "@/server/session";
import { RestrictedEditor } from "../forms";

export const metadata: Metadata = { title: "Restricted items" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  return <RestrictedEditor rows={await listRestricted(getDb())} />;
}
