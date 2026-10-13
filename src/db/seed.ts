// Seeds base data. Idempotent: safe to run on every deploy.
//   npm run db:seed           settings, restricted items, admin, open batches
//   npm run db:seed -- --demo also a demo student, showcase cards and orders (never in production)
import { TZDate } from "@date-fns/tz";
import { addDays, set } from "date-fns";
import { count, eq } from "drizzle-orm";
import { getCategory } from "../domain/categories";
import { createAuth } from "../server/auth";
import { env } from "../server/env";
import { createDb, getPool } from "./client";
import {
  batches,
  customerProfiles,
  orders,
  orderStatusHistory,
  restrictedItems,
  settings,
  showcaseProducts,
  users,
} from "./schema";

const TZ = "Asia/Kuala_Lumpur";
const demo = process.argv.includes("--demo");

/** 23:59 Malaysia time, `days` from today. */
function cutoffInDays(days: number): Date {
  const myt = addDays(new TZDate(Date.now(), TZ), days);
  return new Date(set(myt, { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 }).getTime());
}

const RESTRICTED: Array<{ keyword: string; modes?: ("air" | "air_sensitive" | "sea")[]; note: string }> = [
  { keyword: "power bank", modes: ["air"], note: "Lithium batteries: air-sensitive line or sea only." },
  { keyword: "充电宝", modes: ["air"], note: "Power bank (Chinese listing)." },
  { keyword: "battery", modes: ["air"], note: "Loose or built-in batteries need the sensitive line." },
  { keyword: "电池", modes: ["air"], note: "Battery (Chinese listing)." },
  { keyword: "perfume", modes: ["air"], note: "Flammable liquid: sensitive line." },
  { keyword: "香水", modes: ["air"], note: "Perfume (Chinese listing)." },
  { keyword: "nail polish", modes: ["air"], note: "Flammable liquid." },
  { keyword: "aerosol", note: "Pressurised containers are refused by most forwarders." },
  { keyword: "magnet", modes: ["air"], note: "Strong magnets interfere with aircraft instruments." },
  { keyword: "knife", note: "Bladed items: check customs rules before quoting." },
  { keyword: "刀", note: "Blade (Chinese listing): check before quoting." },
  { keyword: "vape", note: "E-cigarettes are controlled in Malaysia." },
  { keyword: "电子烟", note: "E-cigarette (Chinese listing)." },
  { keyword: "medicine", note: "Medicines need NPRA approval." },
  { keyword: "replica", note: "Counterfeit goods are refused." },
];

async function main() {
  const e = env();
  const pool = getPool();
  const db = createDb(pool);

  try {
    // Settings: one row, defaults come from the Zod schema.
    await db.insert(settings).values({ id: 1, data: {} }).onConflictDoNothing();

    const [{ n: restrictedCount }] = await db.select({ n: count() }).from(restrictedItems);
    if (restrictedCount === 0) {
      await db.insert(restrictedItems).values(
        RESTRICTED.map((r) => ({ keyword: r.keyword, appliesToModes: r.modes ?? [], note: r.note })),
      );
      console.log(`[seed] ${RESTRICTED.length} restricted keywords`);
    }

    // Admin account. 2FA is enrolled on first sign-in.
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));
      if (!existing) {
        const auth = createAuth(db, { baseURL: e.APP_URL, secret: e.BETTER_AUTH_SECRET });
        await auth.api.signUpEmail({
          body: { name: process.env.ADMIN_NAME ?? "Admin", email: adminEmail, password: adminPassword },
        });
        console.log(`[seed] admin ${adminEmail} created`);
      }
      await db.update(users).set({ role: "admin", emailVerified: true }).where(eq(users.email, adminEmail));
    } else {
      console.log("[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin");
    }

    const [{ n: openBatches }] = await db.select({ n: count() }).from(batches).where(eq(batches.status, "open"));
    if (openBatches === 0) {
      await db.insert(batches).values([
        { code: "Air #12", mode: "air", cutoffAt: cutoffInDays(5), minOrders: 5, forwarder: "default" },
        { code: "Sea #12", mode: "sea", cutoffAt: cutoffInDays(20), minOrders: 8, forwarder: "default" },
      ]);
      console.log("[seed] open batches Air #12, Sea #12");
    }

    if (demo) await seedDemo(db, e);
  } finally {
    await pool.end();
  }
}

async function seedDemo(db: ReturnType<typeof createDb>, e: ReturnType<typeof env>) {
  if (e.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");

  const email = "student@example.com";
  let [student] = await db.select().from(users).where(eq(users.email, email));
  if (!student) {
    const auth = createAuth(db, { baseURL: e.APP_URL, secret: e.BETTER_AUTH_SECRET });
    await auth.api.signUpEmail({ body: { name: "Ahmad Nazri", email, password: "demo-password-123" } });
    [student] = await db.select().from(users).where(eq(users.email, email));
    await db.insert(customerProfiles).values({
      userId: student.id,
      displayName: "Ahmad Nazri",
      phone: "+60123456789",
      campus: "Main campus",
      savedMeasurements: {
        clothing_top: { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 },
      },
    });
    console.log(`[seed] demo student ${email} / demo-password-123`);
  }

  const [{ n: showcaseCount }] = await db.select({ n: count() }).from(showcaseProducts);
  if (showcaseCount === 0) {
    await db.insert(showcaseProducts).values([
      {
        title: "CLIO Eyeshadow Palette",
        variant: "#03 Rose Connect",
        platform: "taobao",
        shippingMode: "air",
        category: "cosmetics",
        retailPriceSen: 15_000,
        halohaulPriceSen: 4_800,
        retailCheckedAt: new Date(),
        isPublished: true,
      },
    ]);
  }

  const [{ n: orderCount }] = await db.select({ n: count() }).from(orders).where(eq(orders.customerId, student.id));
  if (orderCount === 0) {
    const top = getCategory("clothing_top");
    const dress = getCategory("dress");
    const created = await db
      .insert(orders)
      .values([
        {
          customerId: student.id,
          itemName: "Canvas sneakers",
          pathType: "url",
          platform: "taobao",
          productUrl: "https://item.taobao.com/item.htm?id=000000000001",
          category: top.key,
          categorySchemaVersion: top.version,
          details: { chest_cm: 96, shoulder_cm: 44, arm_length_cm: 62, body_length_cm: 70 },
          variantText: "White / L",
          shippingMode: "air",
          remarks: "Canvas sneakers listing — demo",
        },
        {
          customerId: student.id,
          itemName: "Polka dot dress",
          pathType: "reverse_search",
          platform: "rednote",
          category: dress.key,
          categorySchemaVersion: dress.version,
          details: { chest_cm: 86, waist_cm: 70, hip_cm: 94, length_cm: 110 },
          variantText: "Polka dot, navy",
          conditionPreference: "either",
          shippingMode: "sea",
        },
      ])
      .returning({ id: orders.id });
    await db
      .insert(orderStatusHistory)
      .values(created.map((o) => ({ orderId: o.id, toStatus: "submitted" as const, actorId: student.id })));
    console.log(`[seed] demo orders ${created.map((o) => `#${o.id}`).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
