import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { UserRole } from "../domain/enums";
import { getAuth } from "./auth";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  twoFactorEnabled: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Await the request headers first: during prerender this suspends, so the
  // auth instance (and its env/secret checks) is only built at request time.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const u = session.user as typeof session.user & { role: UserRole; twoFactorEnabled?: boolean | null };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
}

/** Any signed-in user. Every student query must be scoped by this user's id. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Admin with 2FA enabled. Non-admins get a 404 so the admin area's existence
 * isn't confirmed; admins without 2FA are sent to set it up first.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (user.role !== "admin") notFound();
  if (!user.twoFactorEnabled) redirect("/admin/setup-2fa");
  return user;
}
