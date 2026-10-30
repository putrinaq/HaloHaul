import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { DRAFT_TTL_DAYS, MAX_DRAFTS, summarizeDraft } from "@/domain/drafts";
import { fmtDateShort } from "@/lib/format";
import { getCatalog } from "@/server/data/categories";
import { listDrafts } from "@/server/drafts";
import { getSessionUser } from "@/server/session";
import { CartList, type CartItem } from "./CartList";

export const metadata: Metadata = { title: "Cart" };

export default function CartPage({ searchParams }: PageProps<"/cart">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="display text-5xl">Cart</h1>
        <Link href="/order/new" className="btn-secondary px-4">
          <Plus className="size-4" aria-hidden />
          Add an item
        </Link>
      </div>
      <p className="mt-2 text-muted-foreground">
        Orders you&apos;ve saved to finish later. Nothing is sent to us until you submit.
      </p>
      <Suspense fallback={<div className="mt-8 h-48 animate-pulse rounded-2xl bg-card" />}>
        <Cart searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Cart({ searchParams }: { searchParams: PageProps<"/cart">["searchParams"] }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/cart");
  const db = getDb();
  const [drafts, catalog, params] = await Promise.all([listDrafts(db, user.id), getCatalog(db), searchParams]);
  const added = typeof params.added === "string" ? params.added : null;

  const items: CartItem[] = drafts.map((d) => ({
    id: d.id,
    savedOn: fmtDateShort(d.updatedAt),
    summary: summarizeDraft(d.data, catalog),
  }));

  return (
    <>
      <CartList items={items} addedId={added && items.some((i) => i.id === added) ? added : null} />
      {items.length > 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">
          Your cart holds up to {MAX_DRAFTS} items. Items you don&apos;t touch for {DRAFT_TTL_DAYS} days are removed.
        </p>
      ) : null}
    </>
  );
}
