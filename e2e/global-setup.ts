// Signs in the seeded admin (enrolling 2FA, as production requires) and the
// demo student through the auth API, and saves their sessions for the tests.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, AUTH_DIR, BASE, STUDENT, totp } from "./helpers";

async function call(p: string, body: unknown, cookie = "") {
  const r = await fetch(`${BASE}/api/auth${p}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, cookie },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${p} → ${r.status} ${JSON.stringify(json)}`);
  return { json, cookie: r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

function storageState(cookie: string) {
  return {
    cookies: cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" as const };
      }),
    origins: [],
  };
}

export default async function globalSetup() {
  mkdirSync(AUTH_DIR, { recursive: true });

  const signIn = await call("/sign-in/email", ADMIN);
  const enabled = await call("/two-factor/enable", { password: ADMIN.password }, signIn.cookie);
  const secret = new URL(enabled.json.totpURI).searchParams.get("secret")!;
  writeFileSync(path.join(AUTH_DIR, "admin-totp.txt"), secret);
  const verified = await call("/two-factor/verify-totp", { code: totp(secret) }, signIn.cookie);
  writeFileSync(path.join(AUTH_DIR, "admin.json"), JSON.stringify(storageState(verified.cookie)));

  const student = await call("/sign-in/email", STUDENT);
  writeFileSync(path.join(AUTH_DIR, "student.json"), JSON.stringify(storageState(student.cookie)));
}
