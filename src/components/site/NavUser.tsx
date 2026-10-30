import { CircleUserRound, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db/client";
import { countDrafts } from "@/server/drafts";
import { getSessionUser } from "@/server/session";

/**
 * Reads the session, so it always renders inside <Suspense>. On phones a
 * signed-in person reaches Orders and Account from the bottom tab bar, so
 * only the signed-out "Sign In" shows there.
 */
export async function NavUser() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm text-white transition-colors active:bg-white/20 md:min-h-0 md:bg-transparent md:px-0 md:text-base"
      >
        <span className="link-underline">Sign In</span>
      </Link>
    );
  }
  const account = (
    <Link
      href="/account"
      aria-label="Account"
      title="Account"
      className="hidden size-11 place-items-center rounded-full transition-[transform,background-color] duration-300 hover:scale-110 hover:bg-white/10 md:grid"
    >
      <CircleUserRound className="size-6" aria-hidden />
    </Link>
  );

  // Admins run the shop rather than order from it: no cart or "My orders".
  if (user.role === "admin") {
    return (
      <div className="flex items-center gap-1 text-white sm:gap-3 md:text-base">
        <Link
          href="/admin"
          className="flex min-h-11 items-center rounded-full bg-sky-400/15 px-4 text-sm whitespace-nowrap text-sky-200 transition-colors hover:bg-sky-400/25 md:text-base"
        >
          Admin
        </Link>
        {account}
      </div>
    );
  }

  const inCart = await countDrafts(getDb(), user.id);
  return (
    <div className="flex items-center gap-1 text-white sm:gap-3 md:text-base">
      {/* On phones the tab bar has Orders and Account, so only the cart shows here. */}
      <Link href="/orders" className="link-underline hidden whitespace-nowrap md:inline">
        My orders
      </Link>
      <Link
        href="/cart"
        aria-label={inCart ? `Cart, ${inCart} item${inCart === 1 ? "" : "s"}` : "Cart"}
        title="Cart"
        className="relative grid size-11 place-items-center rounded-full transition-[transform,background-color] duration-300 hover:scale-110 hover:bg-white/10"
      >
        <ShoppingCart className="size-5" aria-hidden />
        {inCart ? (
          <span aria-hidden className="absolute top-1 right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-sky-400 px-1 text-[10px] font-semibold text-black tabular-nums">
            {inCart}
          </span>
        ) : null}
      </Link>
      {account}
    </div>
  );
}
