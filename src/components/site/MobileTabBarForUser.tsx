import { getSessionUser } from "@/server/session";
import { MobileTabBar } from "./MobileTabBar";

/**
 * Signed-in people only: visitors use the header's menu. Reads the session, so
 * it renders inside <Suspense>; admins get their own tab.
 */
export async function MobileTabBarForUser() {
  const user = await getSessionUser();
  return user ? <MobileTabBar admin={user.role === "admin"} /> : null;
}
