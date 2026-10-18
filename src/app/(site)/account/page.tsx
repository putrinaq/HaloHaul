import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/order/StatusBadge";
import { getDb } from "@/db/client";
import { fmtDateShort, orderNo } from "@/lib/format";
import { getCatalog } from "@/server/data/categories";
import { getProfile } from "@/server/data/customer";
import { helpImageUrls } from "@/server/photos";
import { getPhotoStore } from "@/server/storage";
import { listOrdersForCustomer } from "@/server/data/orders";
import { getSessionUser } from "@/server/session";
import { MeasurementsEditor } from "./MeasurementsEditor";
import { ProfileForm } from "./ProfileForm";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="display text-5xl">Account</h1>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-2xl bg-card" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  const db = getDb();
  const [profile, orders, catalog] = await Promise.all([getProfile(db, user.id), listOrdersForCustomer(db, user.id), getCatalog(db)]);

  return (
    <div className="mt-8 space-y-10">
      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h2 className="text-xl font-medium">Contact details</h2>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <ProfileForm
          initial={{
            displayName: profile?.displayName ?? user.name,
            phone: profile?.phone ?? "",
            campus: profile?.campus ?? "",
          }}
        />
        <p className="text-xs text-muted-foreground">
          We only use your number to message you about your orders on WhatsApp.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-medium">Saved measurements</h2>
        <p className="text-sm text-muted-foreground">Used to prefill your orders. Personal data — see our privacy notice.</p>
        <MeasurementsEditor
          saved={profile?.savedMeasurements ?? {}}
          library={catalog.measurements}
          helpImageUrls={await helpImageUrls(getPhotoStore(), catalog)}
          hasProfile={profile !== null}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Order history</h2>
          <Link href="/orders" className="-mr-2 flex min-h-11 items-center px-2 text-sm">
            <span className="link-underline">See all</span>
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-card">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-3 p-4 hover:bg-white/5 active:bg-white/10">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{orderNo(o.id)}</span> {o.itemName}
                    <span className="block text-xs text-muted-foreground">{fmtDateShort(o.createdAt)}</span>
                  </span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SignOutButton />
    </div>
  );
}
