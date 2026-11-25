import { z } from "zod";

// All secrets come from environment variables. Validation is lazy so that
// `next build` (which imports route modules) works without production secrets.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  /** Pool size per process. Postgres max_connections is 20 on the VPS. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(10).default(5),

  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** Admin pages require 2FA. "false" turns that off outside production only (see adminNeedsTwoFactor). */
  ADMIN_REQUIRE_2FA: z.stringbool().default(true),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("HaloHaul <hello@halohaul.com>"),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  /** Evolution API: WhatsApp as a linked device (docs/WHATSAPP.md). Wins over Meta's API when both are set. */
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_URL: z.url().default("http://app:3000/api/whatsapp/evolution"),

  /** WhatsApp Cloud API (docs/WHATSAPP.md). Until all are set, Messages opens WhatsApp instead. */
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_GRAPH_URL: z.url().default("https://graph.facebook.com/v26.0"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required in production");
  }
  cached = parsed.data;
  return cached;
}
