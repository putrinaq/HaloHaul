import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { getCategory } from "@/domain/categories";
import { isBatchShippingMode, PATH_TYPES, type PathType } from "@/domain/enums";
import type { OrderFormInput } from "@/domain/orderInput";
import { getNextCutoffs, getPublishedShowcaseById, getSettings } from "@/server/data/catalog";
import { getProfile } from "@/server/data/customer";
import { getSessionUser } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = { title: "Start an order" };

export default function NewOrderPage({ searchParams }: PageProps<"/order/new">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="display text-5xl">Start an order</h1>
      <p className="mt-2 text-muted-foreground">Takes about two minutes. Nothing is charged until you approve a quote.</p>
      <div className="mt-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-card" />}>
          <NewOrder searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function NewOrder({ searchParams }: { searchParams: PageProps<"/order/new">["searchParams"] }) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const user = await getSessionUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, one(v) ?? ""])).toString();
    redirect(`/sign-in?next=${encodeURIComponent(`/order/new${qs ? `?${qs}` : ""}`)}`);
  }

  const db = getDb();
  const now = new Date();
  const showcaseId = one(params.showcase);
  const [settings, profile, cutoffs, showcase] = await Promise.all([
    getSettings(db),
    getProfile(db, user.id),
    getNextCutoffs(db, now),
    showcaseId ? getPublishedShowcaseById(db, showcaseId) : Promise.resolve(null),
  ]);

  const initial: Partial<OrderFormInput> = {
    contact: {
      displayName: profile?.displayName ?? user.name,
      phone: profile?.phone ?? "",
      campus: profile?.campus ?? "",
    },
  };
  const path = one(params.path);
  if (path && (PATH_TYPES as readonly string[]).includes(path)) initial.pathType = path as PathType;
  if (initial.pathType === "digital") Object.assign(initial, { category: "digital", shippingMode: "none" });

  let prefillNote: string | null = null;
  if (showcase) {
    const category = showcase.category && safeCategory(showcase.category);
    Object.assign(initial, {
      pathType: showcase.productUrl ? "url" : "consultation",
      productUrl: showcase.productUrl ?? "",
      itemName: showcase.title,
      variantText: showcase.variant ?? "",
      category: category ?? "",
      remarks: showcase.productUrl ? "" : `I'd like the same as: ${showcase.title}${showcase.variant ? ` (${showcase.variant})` : ""}`,
      ...(isBatchShippingMode(showcase.shippingMode) ? { shippingMode: showcase.shippingMode } : {}),
    } satisfies Partial<OrderFormInput>);
    prefillNote = `Prefilled from “${showcase.title}”. Check the option and your measurements before submitting.`;
  }

  const nextCutoffs = Object.fromEntries(Object.entries(cutoffs).map(([m, d]) => [m, d!.toISOString()]));

  return (
    <OrderForm
      initial={initial}
      settings={settings}
      nextCutoffs={nextCutoffs}
      savedMeasurements={profile?.savedMeasurements ?? {}}
      uploadsEnabled={getPhotoStore() !== null}
      nowMs={now.getTime()}
      prefillNote={prefillNote}
    />
  );
}

function safeCategory(key: string): string | null {
  try {
    return getCategory(key).key;
  } catch {
    return null;
  }
}
