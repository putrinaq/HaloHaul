import { getSessionUser } from "@/server/session";
import { MobileTabBar } from "./MobileTabBar";

/** Reads the session (so it renders inside <Suspense>) to give admins their own tab. */
export async function MobileTabBarForUser() {
  const user = await getSessionUser();
  return <MobileTabBar admin={user?.role === "admin"} />;
}
