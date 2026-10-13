import type { PathType, Platform } from "./enums";
import { PLATFORM_LABELS } from "./labels";

// Link validation for the "You have a link" path. Only supported Chinese
// platforms are accepted. RedNote and Douyin links that point at a content
// post (not a product page) are routed to reverse search.

export type LinkKind = "product" | "content_post";

export type LinkResult =
  | { ok: true; url: string; platform: Exclude<Platform, "other">; kind: LinkKind }
  | { ok: false; error: string };

const MAX_URL_LENGTH = 2048;

/** Most specific first: "2.taobao.com" is Xianyu, the rest of taobao.com is Taobao. */
const HOSTS: ReadonlyArray<readonly [string, Exclude<Platform, "other">]> = [
  ["2.taobao.com", "xianyu"],
  ["goofish.com", "xianyu"],
  ["taobao.com", "taobao"],
  ["tmall.com", "taobao"],
  ["tmall.hk", "taobao"],
  ["tb.cn", "taobao"],
  ["yangkeduo.com", "pdd"],
  ["pinduoduo.com", "pdd"],
  ["weidian.com", "weidian"],
  ["koudai.com", "weidian"],
  ["1688.com", "1688"],
  ["meituan.com", "meituan"],
  ["jd.com", "jd"],
  ["jd.hk", "jd"],
  ["3.cn", "jd"],
  ["dewu.com", "dewu"],
  ["poizon.com", "dewu"],
  ["dw4.co", "dewu"],
  ["xiaohongshu.com", "rednote"],
  ["xhslink.com", "rednote"],
  ["jinritemai.com", "douyin"],
  ["douyin.com", "douyin"],
  ["iesdouyin.com", "douyin"],
];

export const SUPPORTED_PLATFORMS: ReadonlyArray<Exclude<Platform, "other">> = [
  ...new Set(HOSTS.map(([, p]) => p)),
];

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function platformForHost(hostname: string): Exclude<Platform, "other"> | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const [suffix, platform] of HOSTS) if (hostMatches(host, suffix)) return platform;
  return null;
}

/**
 * Pull the first URL out of pasted text. Chinese apps share links wrapped in
 * text, e.g. "【淘宝】限时特惠 https://m.tb.cn/h.5abc?tk=xyz 复制打开淘宝".
 */
export function extractUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"'，。！？、；：（）【】「」《》]+/i.exec(text);
  if (match) return match[0].replace(/[.,;:!?)\]]+$/, "");
  // A bare domain with a path, e.g. "item.taobao.com/item.htm?id=1".
  const bare = /\b((?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'，。]*)/i.exec(text);
  return bare ? `https://${bare[1].replace(/[.,;:!?)\]]+$/, "")}` : null;
}

/** RedNote / Douyin: is this a shop product page or a content post? */
export function linkKind(platform: Platform, url: URL): LinkKind {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (platform === "rednote") {
    if (/\/goods(-detail)?\//.test(path) || hostMatches(host, "mall.xiaohongshu.com")) {
      return "product";
    }
    // Posts (/explore/, /discovery/item/) and xhslink.com short links, which
    // are almost always shared posts.
    return "content_post";
  }
  if (platform === "douyin") {
    if (hostMatches(host, "jinritemai.com")) return "product"; // Douyin shop
    // /video/, /note/, v.douyin.com and iesdouyin.com share links.
    return "content_post";
  }
  return "product";
}

export function validateProductLink(input: string): LinkResult {
  const raw = extractUrl(input.trim());
  if (!raw) return { ok: false, error: "Paste the product link (it starts with https://)." };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long." };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "That doesn't look like a valid link." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only web links (https://) are supported." };
  }
  if (url.username || url.password) return { ok: false, error: "That doesn't look like a valid link." };

  const platform = platformForHost(url.hostname);
  if (!platform) {
    const names = SUPPORTED_PLATFORMS.map((p) => PLATFORM_LABELS[p]).join(", ");
    return { ok: false, error: `We only buy from supported platforms: ${names}.` };
  }

  url.protocol = "https:";
  url.hash = "";
  return { ok: true, url: url.toString(), platform, kind: linkKind(platform, url) };
}

export interface RoutedPath {
  pathType: PathType;
  /** Set when the path was changed, to explain why to the student. */
  rerouted: boolean;
}

/** A content-post link on the link path becomes a reverse search. */
export function routeForLink(pathType: PathType, link: LinkResult): RoutedPath {
  if (pathType === "url" && link.ok && link.kind === "content_post") {
    return { pathType: "reverse_search", rerouted: true };
  }
  return { pathType, rerouted: false };
}

export function contentPostNotice(platform: Platform, feeLabel: string): string {
  return (
    `That ${PLATFORM_LABELS[platform]} link points to a post, not a product page, so we've ` +
    `switched this to a photo search: we'll find the item from the post for you. ` +
    `The ${feeLabel} search fee is credited toward your order if you go ahead.`
  );
}
