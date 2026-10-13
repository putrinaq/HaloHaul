/** Only same-site paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/orders"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
