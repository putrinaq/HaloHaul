import { describe, expect, it } from "vitest";
import { contentPostNotice, extractUrl, platformForHost, routeForLink, validateProductLink } from "./links";

describe("platformForHost", () => {
  it.each([
    ["item.taobao.com", "taobao"],
    ["detail.tmall.com", "taobao"],
    ["m.tb.cn", "taobao"],
    ["2.taobao.com", "xianyu"],
    ["www.goofish.com", "xianyu"],
    ["mobile.yangkeduo.com", "pdd"],
    ["weidian.com", "weidian"],
    ["detail.1688.com", "1688"],
    ["item.jd.com", "jd"],
    ["3.cn", "jd"],
    ["www.dewu.com", "dewu"],
    ["www.xiaohongshu.com", "rednote"],
    ["xhslink.com", "rednote"],
    ["v.douyin.com", "douyin"],
    ["haohuo.jinritemai.com", "douyin"],
    ["i.meituan.com", "meituan"],
    ["ITEM.TAOBAO.COM.", "taobao"],
  ])("%s → %s", (host, platform) => {
    expect(platformForHost(host)).toBe(platform);
  });

  it("rejects look-alike and unsupported hosts", () => {
    for (const host of ["nottaobao.com", "taobao.com.evil.io", "amazon.com", "shopee.com.my", "faketb.cn"]) {
      expect(platformForHost(host), host).toBeNull();
    }
  });
});

describe("extractUrl", () => {
  it("finds the link inside Chinese share text", () => {
    expect(extractUrl("【淘宝】限时特惠 https://m.tb.cn/h.5abcDEF?tk=xyz 复制打开淘宝")).toBe(
      "https://m.tb.cn/h.5abcDEF?tk=xyz",
    );
    expect(extractUrl("看看这个，https://v.douyin.com/iAbC123/。")).toBe("https://v.douyin.com/iAbC123/");
  });

  it("strips trailing punctuation", () => {
    expect(extractUrl("see https://item.jd.com/100.html.")).toBe("https://item.jd.com/100.html");
  });

  it("accepts a bare domain with a path", () => {
    expect(extractUrl("item.taobao.com/item.htm?id=1")).toBe("https://item.taobao.com/item.htm?id=1");
  });

  it("returns null when there is no link", () => {
    expect(extractUrl("just some words")).toBeNull();
  });
});

describe("validateProductLink", () => {
  it("accepts product pages and normalises to https without a fragment", () => {
    expect(validateProductLink("http://item.taobao.com/item.htm?id=123#sku")).toEqual({
      ok: true,
      url: "https://item.taobao.com/item.htm?id=123",
      platform: "taobao",
      kind: "product",
    });
  });

  it("rejects unsupported platforms with the supported list", () => {
    const r = validateProductLink("https://www.amazon.com/dp/B000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Taobao.*Pinduoduo/);
  });

  it("rejects non-links, credentials in URLs, and other schemes", () => {
    expect(validateProductLink("").ok).toBe(false);
    expect(validateProductLink("not a link").ok).toBe(false);
    expect(validateProductLink("https://user:pw@item.taobao.com/x").ok).toBe(false);
    expect(validateProductLink(`https://item.taobao.com/${"a".repeat(3000)}`).ok).toBe(false);
  });

  it("classifies RedNote links", () => {
    const post = validateProductLink("https://www.xiaohongshu.com/explore/65a1b2c3d4");
    const short = validateProductLink("http://xhslink.com/a/AbCdEf");
    const goods = validateProductLink("https://www.xiaohongshu.com/goods-detail/6512345");
    expect(post).toMatchObject({ ok: true, platform: "rednote", kind: "content_post" });
    expect(short).toMatchObject({ ok: true, platform: "rednote", kind: "content_post" });
    expect(goods).toMatchObject({ ok: true, platform: "rednote", kind: "product" });
  });

  it("classifies Douyin links", () => {
    expect(validateProductLink("https://www.douyin.com/video/7300000000000000000")).toMatchObject({ kind: "content_post" });
    expect(validateProductLink("https://v.douyin.com/iAbC123/")).toMatchObject({ kind: "content_post" });
    expect(validateProductLink("https://haohuo.jinritemai.com/views/product/item2?id=3600")).toMatchObject({
      platform: "douyin",
      kind: "product",
    });
  });
});

describe("routeForLink", () => {
  it("routes content posts on the link path to reverse search", () => {
    const post = validateProductLink("https://www.xiaohongshu.com/explore/65a1");
    expect(routeForLink("url", post)).toEqual({ pathType: "reverse_search", rerouted: true });
  });

  it("leaves product links and other paths alone", () => {
    const product = validateProductLink("https://item.taobao.com/item.htm?id=1");
    const post = validateProductLink("https://v.douyin.com/abc/");
    expect(routeForLink("url", product)).toEqual({ pathType: "url", rerouted: false });
    expect(routeForLink("reverse_search", post)).toEqual({ pathType: "reverse_search", rerouted: false });
  });

  it("explains the reroute", () => {
    expect(contentPostNotice("rednote", "RM 4.00")).toMatch(/RedNote link points to a post.*RM 4\.00/);
  });
});

describe("SUPPORTED_PLATFORMS", () => {
  it("lists every platform we accept links from, once", async () => {
    const { SUPPORTED_PLATFORMS } = await import("./links");
    const hosts = ["taobao.com", "yangkeduo.com", "weidian.com", "goofish.com", "douyin.com", "dewu.com", "jd.com", "1688.com", "meituan.com", "xiaohongshu.com"];
    expect(new Set(hosts.map((h) => platformForHost(h)))).toEqual(new Set(SUPPORTED_PLATFORMS));
    expect(new Set(SUPPORTED_PLATFORMS).size).toBe(SUPPORTED_PLATFORMS.length);
  });
});
