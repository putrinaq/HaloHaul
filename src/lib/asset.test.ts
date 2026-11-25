import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./assets.json";

const files = ["brand", "images", "videos"].flatMap((folder) => readdirSync(path.resolve("public", folder)).map((f) => `/${folder}/${f}`));

describe("CDN assets", () => {
  it("lists exactly the files in public/", () => {
    expect(Object.keys(manifest).sort()).toEqual(files.sort());
  });

  it.each(Object.entries(manifest))("%s is the uploaded version (if not: scripts/upload-assets.mjs)", (file, address) => {
    const hash = createHash("sha256").update(readFileSync(path.join("public", file))).digest("hex").slice(0, 12);
    expect(address).toContain(`.${hash}.`);
  });
});
