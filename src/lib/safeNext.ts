/** Only same-site paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/orders"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.length > 512) return fallback;
  // Browsers treat "\" like "/" (so "/\evil.com" leaves the site); control
  // characters can split or disguise the URL.
  if (/[\\\u0000-\u001F\u007F]/.test(next)) return fallback;
  return next;
}

/** Where an admin lands after signing in: only pages inside the console. */
export function safeAdminNext(next: string | null | undefined): string {
  const path = safeNext(next, "/admin");
  return /^\/admin(?:[/?#]|$)/.test(path) && !path.startsWith("/admin/sign-in") ? path : "/admin";
}
