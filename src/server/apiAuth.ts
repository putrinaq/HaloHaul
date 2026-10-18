import "server-only";
import { getAuth } from "./auth";
import { adminNeedsTwoFactor } from "./session";

/** Session user for a route handler, or null. */
export async function sessionUserId(req: Request): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

/** The admin behind a route-handler request (same rule as adminActor: role + 2FA when required), or null. */
export async function adminUserId(req: Request): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  const user = session?.user as { id: string; role?: string; twoFactorEnabled?: boolean | null } | undefined;
  if (user?.role !== "admin") return null;
  return user.twoFactorEnabled || !adminNeedsTwoFactor() ? user.id : null;
}

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}
