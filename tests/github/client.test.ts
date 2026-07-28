import { describe, expect, it } from "vitest";

import { SafeGitHubReader } from "../../src/lib/github/client";
import { IMPORT_LIMITS } from "../../src/lib/imports/types";
import type { BenchmarkSource } from "../../src/lib/sources/types";

const source: BenchmarkSource = { id: "preview", repo: "owner/repo", branch: "main", adapter: "fixture", enabled: true, allowlist: ["benchmarks/demo/**"] };

describe("SafeGitHubReader", () => {
  it("reads an allowed binary preview asset without treating it as source text", async () => {
    const reader = new SafeGitHubReader(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-length": "4" } }));

    await expect(reader.readBinary(source, "benchmarks/demo/assets/hero.png")).resolves.toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("enforces the shared import bounds for remote text and binary files", async () => {
    const oversizedText = new SafeGitHubReader(async () => new Response("not read", {
      headers: { "content-length": String(IMPORT_LIMITS.textFileBytes + 1) }
    }));
    await expect(oversizedText.readText(source, "benchmarks/demo/index.html"))
      .rejects.toThrow(String(IMPORT_LIMITS.textFileBytes));

    const allowedBinary = new Uint8Array(IMPORT_LIMITS.textFileBytes + 1);
    const binaryReader = new SafeGitHubReader(async () => new Response(allowedBinary, {
      headers: { "content-length": String(allowedBinary.byteLength) }
    }));
    await expect(binaryReader.readBinary(source, "benchmarks/demo/assets/hero.png"))
      .resolves.toHaveLength(IMPORT_LIMITS.textFileBytes + 1);
  });
});
