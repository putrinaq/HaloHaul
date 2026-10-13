import "server-only";
import { getAuth } from "./auth";

/** Session user for a route handler, or null. */
export async function sessionUserId(req: Request): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

export function jsonError(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers });
}
