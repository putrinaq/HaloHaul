import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { getSessionUser } from "@/server/session";

/** Reads the session, so it always renders inside <Suspense>. */
export async function NavUser() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Link href="/sign-in" className="border-b border-white/70 pb-0.5 text-sm text-white sm:text-base">
        Sign In
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4 text-white sm:text-base">
      <Link href="/orders" className="hidden whitespace-nowrap hover:underline sm:inline">
        My orders
      </Link>
      <Link href="/account" aria-label="Account" title="Account" className="grid place-items-center">
        <CircleUserRound className="size-6" aria-hidden />
      </Link>
    </div>
  );
}
