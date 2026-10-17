/** Only same-site paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/orders"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.length > 512) return fallback;
  // Browsers treat "\" like "/" (so "/\evil.com" leaves the site); control
  // characters can split or disguise the URL.
  if (/[\\\u0000-\u001F\u007F]/.test(next)) return fallback;
  return next;
}
