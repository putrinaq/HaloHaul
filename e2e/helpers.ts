import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const BASE = "http://localhost:3200";
export const AUTH_DIR = path.resolve(__dirname, ".auth");
export const ADMIN = { email: "e2e-admin@example.com", password: "e2e-admin-password" };
export const STUDENT = { email: "student@example.com", password: "demo-password-123" };

function base32(s: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

/** The current 6-digit code for a TOTP secret (what an authenticator app shows). */
export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

export const adminSecret = () => readFileSync(path.join(AUTH_DIR, "admin-totp.txt"), "utf8").trim();
