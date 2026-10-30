import { describe, expect, it } from "vitest";
import { clientIp, etagOf, jsonWithEtag, notModified } from "./http";

const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/x", { headers });

describe("clientIp", () => {
  it("takes the first X-Forwarded-For address, then X-Real-IP", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("jsonWithEtag", () => {
  it("sends JSON with a stable ETag and the given caching", async () => {
    const res = jsonWithEtag(req(), { a: 1 }, { cacheControl: "public, no-cache" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(res.headers.get("cache-control")).toBe("public, no-cache");
    expect(res.headers.get("etag")).toBe(etagOf('{"a":1}'));
    expect(await res.json()).toEqual({ a: 1 });
    expect(etagOf('{"a":2}')).not.toBe(etagOf('{"a":1}'));
  });

  it("answers 304 with no body when the client already has it", async () => {
    const etag = etagOf('{"a":1}');
    const res = jsonWithEtag(req({ "if-none-match": `"other", ${etag}` }), { a: 1 }, { cacheControl: "no-cache" });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(etag);
    expect(await res.text()).toBe("");
  });

  it("compares weakly and understands *", () => {
    const etag = etagOf("x");
    expect(notModified(req({ "if-none-match": etag.replace(/^W\//, "") }), etag)).toBe(true);
    expect(notModified(req({ "if-none-match": "*" }), etag)).toBe(true);
    expect(notModified(req({ "if-none-match": '"nope"' }), etag)).toBe(false);
    expect(notModified(req(), etag)).toBe(false);
  });
});
