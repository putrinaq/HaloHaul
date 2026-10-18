import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { measurementUsage } from "@/server/admin/categories";
import { getCatalog } from "@/server/data/categories";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { MeasurementLibrary } from "./MeasurementLibrary";

export const metadata: Metadata = { title: "Measurement library" };

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
  const [catalog, usage] = await Promise.all([getCatalog(db), measurementUsage(db)]);
  const images = await imageUrlMap(getPhotoStore(), catalog.measurements.flatMap((m) => (m.helpImageKey ? [m.helpImageKey] : [])));
  return (
    <MeasurementLibrary
      rows={catalog.measurements.map((m) => ({ ...m, usedBy: usage.get(m.key) ?? [], imageUrl: m.helpImageKey ? (images[m.helpImageKey]?.thumb ?? null) : null }))}
    />
  );
}
