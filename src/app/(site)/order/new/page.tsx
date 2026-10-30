import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { findCategory } from "@/domain/catalog";
import { orderableCategories } from "@/domain/categoryApi";
import { isBatchShippingMode, STUDENT_PATH_TYPES, type StudentPathType } from "@/domain/enums";
import type { OrderFormInput } from "@/domain/orderInput";
import { getNextCutoffs, getPublishedShowcaseById, getSettings } from "@/server/data/catalog";
import { getCatalog } from "@/server/data/categories";
import { getProfile } from "@/server/data/customer";
import { getDraft } from "@/server/drafts";
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
  const draftParam = one(params.draft);
  const [catalog, settings, profile, cutoffs, showcase, draft] = await Promise.all([
    getCatalog(db),
    getSettings(db),
    getProfile(db, user.id),
    getNextCutoffs(db, now),
    showcaseId ? getPublishedShowcaseById(db, showcaseId) : Promise.resolve(null),
    // Scoped to this student: someone else's draft id just isn't found.
    draftParam && /^[0-9a-f-]{36}$/.test(draftParam) ? getDraft(db, user.id, draftParam) : Promise.resolve(null),
  ]);

  const initial: Partial<OrderFormInput> = {
    contact: {
      displayName: profile?.displayName ?? user.name,
      phone: profile?.phone ?? "",
      campus: profile?.campus ?? "",
    },
  };
  const path = one(params.path);
  if (path && (STUDENT_PATH_TYPES as readonly string[]).includes(path)) initial.pathType = path as StudentPathType;
  // A link straight to a category, e.g. /order/new?category=shoes.
  const categoryParam = one(params.category);
  if (categoryParam && orderableCategories(catalog).some((c) => c.key === categoryParam)) initial.category = categoryParam;

  let prefillNote: string | null = null;
  if (showcase) {
    const found = findCategory(catalog, showcase.category);
    const category = found?.fulfilment === "physical" ? found.key : undefined;
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

  if (draft) {
    const saved = draft.data as Partial<OrderFormInput>;
    Object.assign(initial, saved, { contact: { ...initial.contact, ...saved.contact } });
    prefillNote = "From your cart. Finish it and submit, or save your changes back to the cart.";
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
      draftId={draft?.id ?? null}
    />
  );
}
