import { AlertTriangle, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, PageHeader, Pagination } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { PLATFORM_LABELS } from "@/domain/labels";
import { formatMyr } from "@/domain/money";
import { fmtDate } from "@/lib/format";
import { listProducts, recentCompletedOrders, STALE_RETAIL_DAYS } from "@/server/admin/products";
import { getCatalog } from "@/server/data/categories";
import { imageUrlMap } from "@/server/photos";
import { requireAdmin } from "@/server/session";
import { getPhotoStore } from "@/server/storage";
import { EditProductButton, NewProductButtons, PublishToggle } from "./ProductControls";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/5" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function load(page: number) {
  await requireAdmin();
  const db = getDb();
  const [{ rows, pageCount }, completed, catalog] = await Promise.all([listProducts(db, page), recentCompletedOrders(db), getCatalog(db)]);
  const urls = await imageUrlMap(getPhotoStore(), rows.flatMap((r) => (r.photoKey ? [r.photoKey] : [])));
  return { rows, pageCount, completed, categories: catalog.categories.map((c) => ({ key: c.key, name: c.name })), urls, now: Date.now() };
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/products">["searchParams"] }) {
  const page = Math.max(1, Number.parseInt(String((await searchParams).page ?? "1"), 10) || 1);
  const { rows, pageCount, completed, categories, urls, now } = await load(page);
  const staleBefore = now - STALE_RETAIL_DAYS * 86_400_000;
  return (
    <>
      <PageHeader title="Products" subtitle="Showcase cards: “What people bought recently” on the home page and catalogue." actions={<NewProductButtons completedOrders={completed} categories={categories} />} />
      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState icon={ShoppingBag} title="No showcase cards yet" body="Create one from a completed order to show real savings." />
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const stale = !p.retailCheckedAt || p.retailCheckedAt.getTime() < staleBefore;
            const img = p.photoKey ? urls[p.photoKey] : undefined;
            return (
              <li key={p.id} className="admin-card flex flex-col overflow-hidden">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL
                  <img src={img.thumb} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center bg-white/5 text-sm text-white/40">No photo</div>
                )}
                <div className="flex flex-1 flex-col p-4 text-sm">
                  <p className="font-medium">{p.title}</p>
                  {p.variant ? <p className="text-white/55">{p.variant}</p> : null}
                  <p className="mt-2 tabular-nums">
                    {formatMyr(p.halohaulPriceSen)} <span className="text-white/45 line-through">{formatMyr(p.retailPriceSen)}</span>
                  </p>
                  <p className="text-xs text-white/45">{PLATFORM_LABELS[p.platform]}</p>
                  {stale ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      Retail price {p.retailCheckedAt ? `checked ${fmtDate(p.retailCheckedAt, "d MMM yyyy")}` : "never checked"} — over {STALE_RETAIL_DAYS} days
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/45">Retail checked {fmtDate(p.retailCheckedAt!, "d MMM yyyy")}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <PublishToggle id={p.id} published={p.isPublished} />
                    <EditProductButton
                      categories={categories}
                      value={{
                        id: p.id,
                        title: p.title,
                        variant: p.variant,
                        platform: p.platform,
                        shippingMode: p.shippingMode,
                        productUrl: p.productUrl,
                        category: p.category,
                        retailPriceSen: p.retailPriceSen,
                        halohaulPriceSen: p.halohaulPriceSen,
                        photoKey: p.photoKey,
                        photoUrl: img?.thumb ?? null,
                        retailCheckedAt: p.retailCheckedAt ? p.retailCheckedAt.toISOString().slice(0, 10) : null,
                        isPublished: p.isPublished,
                        sortOrder: p.sortOrder,
                        sourceOrderId: p.sourceOrderId,
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} href={(n) => `/admin/products?page=${n}`} />
    </>
  );
}
