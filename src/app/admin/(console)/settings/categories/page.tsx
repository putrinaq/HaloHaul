import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { listCategoriesAdmin } from "@/server/admin/categories";
import { requireAdmin } from "@/server/session";
import { CategoryList } from "./CategoryList";

export const metadata: Metadata = { title: "Categories" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  return <CategoryList rows={await listCategoriesAdmin(getDb())} />;
}
