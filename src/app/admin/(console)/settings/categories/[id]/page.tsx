import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getCategoryAdmin } from "@/server/admin/categories";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { CategoryEditor } from "../CategoryEditor";

export const metadata: Metadata = { title: "Category" };

export default function Page({ params }: PageProps<"/admin/settings/categories/[id]">) {
  return (
    <div>
      <Link href="/admin/settings/categories" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-white/55 hover:text-white">
        <ArrowLeft className="size-4" aria-hidden />
        Categories
      </Link>
      <Suspense fallback={<div className="mt-4 h-128 animate-pulse rounded-2xl bg-white/5" />}>
        <Load params={params} />
      </Suspense>
    </div>
  );
}

async function Load({ params }: { params: PageProps<"/admin/settings/categories/[id]">["params"] }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await getCategoryAdmin(getDb(), id);
  if (!data) notFound();
  const defs = [data.draft?.definition, data.published?.definition].filter((d) => d !== undefined);
  const keys = [
    ...data.library.flatMap((m) => (m.helpImageKey ? [m.helpImageKey] : [])),
    ...defs.flatMap((d) => d.sections.flatMap((s) => s.fields.flatMap((f) => (f.helpImageKey ? [f.helpImageKey] : [])))),
  ];
  const urls = await imageUrlMap(getPhotoStore(), keys);
  // Keyed by version, so discarding or publishing a draft starts the editor afresh.
  // Remount only when a new version goes live: saving the first draft must not
  // reset the editor (it would drop the Publish drawer it just opened).
  return <CategoryEditor key={data.published?.id ?? data.category.id} data={data} imageUrls={Object.fromEntries(Object.entries(urls).map(([k, v]) => [k, v.thumb]))} />;
}
