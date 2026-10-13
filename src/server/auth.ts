import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { USER_ROLES } from "../domain/enums";
import { getDb } from "../db/client";
import { accounts, sessions, twoFactors, users, verifications } from "../db/schema";
import { sendEmail } from "./email";
import { env } from "./env";

type AuthDb = Parameters<typeof drizzleAdapter>[0];

export function createAuth(db: AuthDb, opts: { baseURL: string; secret: string }) {
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
    advanced: {
      // Caddy sets X-Forwarded-For and discards any client-supplied value.
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
      nextCookies(), // must stay last
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
