import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { USER_ROLES } from "../domain/enums";
import { checkPassword, cleanEmail, cleanName, type Cleaned } from "../domain/sanitize";
import { getDb } from "../db/client";
import { accounts, sessions, twoFactors, users, verifications } from "../db/schema";
import { sendEmail } from "./email";
import { env } from "./env";

type AuthDb = Parameters<typeof drizzleAdapter>[0];

const EMAIL_PATHS = new Set(["/sign-up/email", "/sign-in/email", "/sign-in/magic-link", "/request-password-reset"]);
const NAME_PATHS = new Set(["/sign-up/email", "/update-user"]);
const PASSWORD_PATHS = new Set(["/sign-up/email", "/sign-in/email"]);

function accept(result: Cleaned): string {
  if (!result.ok) throw new APIError("BAD_REQUEST", { message: result.error });
  return result.value;
}

/**
 * Server-side gate for everything a person types into the auth forms. Names
 * and emails are cleaned (see domain/sanitize) and replaced in the request
 * body; anything that still looks like markup or a script is refused before
 * Better Auth touches the database. Passwords are only bounded, never changed.
 */
const sanitizeAuthInput = createAuthMiddleware(async (ctx) => {
  const body = ctx.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return;
  const path = ctx.path;
  const cleaned: Record<string, unknown> = {};

  if (EMAIL_PATHS.has(path)) cleaned.email = accept(cleanEmail(body.email));
  if (NAME_PATHS.has(path) && (path === "/sign-up/email" || body.name !== undefined)) {
    cleaned.name = accept(cleanName(body.name));
  }
  if (PASSWORD_PATHS.has(path)) accept(checkPassword(body.password, { forSignUp: path === "/sign-up/email" }));
  // An `image` URL is never set from our forms; don't let one be smuggled in.
  if (NAME_PATHS.has(path) && body.image !== undefined) throw new APIError("BAD_REQUEST", { message: "Unsupported field." });

  if (Object.keys(cleaned).length === 0) return;
  return { context: { body: { ...body, ...cleaned } } };
});

/**
 * `nextCookies: false` for scripts (seed) that run outside Next.js: the worker
 * image has no `next` package, and the plugin's after-hook only swallows
 * "Cannot find module", not ESM's "Cannot find package".
 */
export function createAuth(db: AuthDb, opts: { baseURL: string; secret: string; nextCookies?: boolean }) {
  return betterAuth({
    appName: "HaloHaul",
    baseURL: opts.baseURL,
    secret: opts.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        twoFactor: twoFactors,
      },
    }),
    user: {
      additionalFields: {
        role: {
          type: [...USER_ROLES],
          required: true,
          defaultValue: "student",
          // Never settable from sign-up or profile updates.
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-in/magic-link": { window: 300, max: 3 },
        "/sign-up/email": { window: 300, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 300, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },
    hooks: { before: sanitizeAuthInput },
    advanced: {
      // The reverse proxy (Nginx) overwrites X-Forwarded-For with the real client.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 10,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          // The two-factor plugin only guards password sign-in, so a magic link
          // would let an admin skip 2FA. Admins must use password + TOTP. The
          // response is identical either way, so this leaks nothing.
          const [account] = await (db as ReturnType<typeof getDb>)
            .select({ role: users.role })
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);
          if (account?.role === "admin") {
            console.warn("[auth] magic link refused for an admin account");
            return;
          }
          await sendEmail({
            to: email,
            subject: "Your HaloHaul sign-in link",
            text: `Sign in to HaloHaul:\n\n${url}\n\nThis link expires in 10 minutes. If you didn't ask for it, ignore this email.`,
            html: `<p>Sign in to HaloHaul:</p><p><a href="${url}">Sign in</a></p><p>This link expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
          });
        },
      }),
      twoFactor({ issuer: "HaloHaul" }),
      ...(opts.nextCookies === false ? [] : [nextCookies()]), // must stay last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | undefined;

/** Lazily built so `next build` doesn't need runtime secrets. */
export function getAuth(): Auth {
  if (!instance) {
    const e = env();
    instance = createAuth(getDb(), { baseURL: e.APP_URL, secret: e.BETTER_AUTH_SECRET });
  }
  return instance;
}
