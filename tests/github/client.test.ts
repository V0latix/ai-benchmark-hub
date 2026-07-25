import { describe, expect, it } from "vitest";

import { SafeGitHubReader } from "../../src/lib/github/client";
import type { BenchmarkSource } from "../../src/lib/sources/types";

const source: BenchmarkSource = { id: "preview", repo: "owner/repo", branch: "main", adapter: "fixture", enabled: true, allowlist: ["benchmarks/demo/**"] };

describe("SafeGitHubReader", () => {
  it("reads an allowed binary preview asset without treating it as source text", async () => {
    const reader = new SafeGitHubReader(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-length": "4" } }));

    await expect(reader.readBinary(source, "benchmarks/demo/assets/hero.png")).resolves.toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});
