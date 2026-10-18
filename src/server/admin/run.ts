import "server-only";
import type { z } from "zod";
import { getDb, type Database } from "../../db/client";
import { InvalidTransitionError } from "../../domain/orderStateMachine";
import { UserError } from "../errors";
import { rateLimit } from "../rateLimit";
import { adminActor, type SessionUser } from "../session";

// Every admin server action goes through runAdmin(): the admin check (role +
// 2FA, on the server, every call), a rate limit, Zod validation of the input,
// and a uniform result shape the drawers know how to show.

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export { UserError } from "../errors";

export interface AdminContext {
  admin: SessionUser;
  db: Database;
}

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.map(String).join(".") || "_form"] ??= issue.message;
  return out;
}

export async function runAdmin<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  fn: (ctx: AdminContext, input: z.output<S>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const admin = await adminActor();
  if (!admin) return { ok: false, error: "Your admin session has ended. Sign in again." };
  if (!rateLimit(`admin:${admin.id}`, 300, 60_000).ok) return { ok: false, error: "That's a lot of changes at once. Give it a minute." };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
  try {
    return await fn({ admin, db: getDb() }, parsed.data);
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
    if (e instanceof InvalidTransitionError) return { ok: false, error: `That step isn't possible right now (${e.reason}).` };
    throw e;
  }
}

export const ok = <T>(data: T, message?: string): ActionResult<T> => ({ ok: true, data, message });

export { audit } from "../audit";
