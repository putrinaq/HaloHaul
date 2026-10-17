import { CircleUserRound } from "lucide-react";
import Link from "next/link";
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
  return (
    <div className="hidden items-center gap-4 text-white md:flex md:text-base">
      <Link href="/orders" className="link-underline whitespace-nowrap">
        My orders
      </Link>
      <Link
        href="/account"
        aria-label="Account"
        title="Account"
        className="grid size-11 place-items-center rounded-full transition-[transform,background-color] duration-300 hover:scale-110 hover:bg-white/10"
      >
        <CircleUserRound className="size-6" aria-hidden />
      </Link>
    </div>
  );
}
