import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { users } from "../db/schema";
import { createTestDb, type TestDb } from "../db/testing";
import { createAuth, type Auth } from "./auth";

let db: TestDb;
let auth: Auth;
let close: () => Promise<void>;
const sentEmails: string[] = [];

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused@localhost/unused");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
  vi.spyOn(console, "info").mockImplementation((msg: string) => {
    if (String(msg).startsWith("[email:dev]")) sentEmails.push(String(msg));
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});

  const t = await createTestDb();
  db = t.db;
  close = () => t.client.close();
  auth = createAuth(db, {
    baseURL: "http://localhost:3000",
    secret: "test-secret-test-secret-test-secret-123",
  });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await close();
});

const json = (body: unknown) =>
  new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });

describe("auth", () => {
  it("signs students up with the student role", async () => {
    const res = await auth.api.signUpEmail({
      body: { name: "Aina", email: "aina@example.com", password: "correct-horse-battery" },
    });
    expect(res.user.email).toBe("aina@example.com");
    const [row] = await db.select().from(users).where(eq(users.email, "aina@example.com"));
    expect(row.role).toBe("student");
  });

  it("ignores a role smuggled into the sign-up request", async () => {
    const res = await auth.handler(
      json({ name: "Mallory", email: "mallory@example.com", password: "correct-horse-battery", role: "admin" }),
    );
    const [row] = await db.select().from(users).where(eq(users.email, "mallory@example.com"));
    // Either the field is rejected outright or silently ignored — never applied.
    if (row) expect(row.role).toBe("student");
    else expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("enforces a minimum password length", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "Short", email: "short@example.com", password: "short" } }),
    ).rejects.toThrow();
  });

  it("sends magic links to students but never to admins", async () => {
    await auth.api.signUpEmail({
      body: { name: "Op", email: "admin@example.com", password: "correct-horse-battery" },
    });
    await db.update(users).set({ role: "admin" }).where(eq(users.email, "admin@example.com"));
    sentEmails.length = 0;

    const student = await auth.api.signInMagicLink({
      body: { email: "aina@example.com" },
      headers: new Headers(),
    });
    const admin = await auth.api.signInMagicLink({
      body: { email: "admin@example.com" },
      headers: new Headers(),
    });

    // Same response for both, so the endpoint can't be used to find admins.
    expect(admin).toEqual(student);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toContain("to=aina@example.com");
  });
});

describe("auth input sanitising", () => {
  // A distinct client IP per request keeps the sign-up rate limit (5 per 5 min) out of the way.
  let ip = 0;
  const signUp = (body: Record<string, unknown>) => {
    const req = json(body);
    req.headers.set("x-forwarded-for", `203.0.113.${++ip}`);
    return auth.handler(req);
  };

  it.each(["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "javascript:alert(1)"])(
    "refuses a sign-up whose name is %j",
    async (name) => {
      const email = `x${Math.random().toString(36).slice(2)}@example.com`;
      const res = await signUp({ name, email, password: "correct-horse-battery" });
      expect(res.status).toBe(400);
      const rows = await db.select().from(users).where(eq(users.email, email));
      expect(rows).toHaveLength(0);
    },
  );

  it("refuses a script-shaped email", async () => {
    const res = await signUp({ name: "Eve", email: "<svg/onload=alert(1)>@x.com", password: "correct-horse-battery" });
    expect(res.status).toBe(400);
  });

  it("stores the cleaned name and email, not what was sent", async () => {
    const res = await signUp({
      name: "  Nur​   Aisyah ",
      email: "  Nur.Aisyah@Example.COM ",
      password: "correct-horse-battery",
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.email, "nur.aisyah@example.com"));
    expect(row.name).toBe("Nur Aisyah");
  });

  it("refuses an image URL smuggled into sign-up", async () => {
    const res = await signUp({
      name: "Mallory",
      email: "mallory2@example.com",
      password: "correct-horse-battery",
      image: "javascript:alert(1)",
    });
    expect(res.status).toBe(400);
  });

  it("applies to server-side calls too", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "<b>x</b>", email: "server@example.com", password: "correct-horse-battery" } }),
    ).rejects.toThrow();
  });
});
