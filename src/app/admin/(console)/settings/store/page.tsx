import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getSettings } from "@/server/data/catalog";
import { imageUrls } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { StoreForm } from "../forms";

export const metadata: Metadata = { title: "Store" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  const settings = await getSettings(getDb());
  const key = settings.store.duitnowQrKey;
  const urls = key ? await imageUrls(getPhotoStore(), key) : null;
  return (
    <div className="max-w-2xl">
      <StoreForm settings={settings} qr={key && urls ? { key, url: urls.thumb } : null} />
      {getPhotoStore() ? null : <p className="mt-3 text-sm text-warning">Image storage isn&apos;t configured, so the QR can&apos;t be uploaded here.</p>}
    </div>
  );
}
