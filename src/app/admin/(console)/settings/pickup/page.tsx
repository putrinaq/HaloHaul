import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getSettings } from "@/server/data/catalog";
import { requireAdmin } from "@/server/session";
import { PickupForm } from "../forms";

export const metadata: Metadata = { title: "Pickup" };

export default function Page() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  await requireAdmin();
  return (
    <div className="max-w-2xl">
      <PickupForm settings={await getSettings(getDb())} />
    </div>
  );
}
