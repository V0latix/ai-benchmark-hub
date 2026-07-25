import { describe, expect, it } from "vitest";

import { getPreviewProxyUrl, injectPreviewBase } from "../../src/lib/visuals/preview";

describe("safe HTML previews", () => {
  it("uses an internal URL rather than framing raw GitHub content", () => {
    expect(getPreviewProxyUrl("run/42")).toBe("/api/runs/run%2F42/visual");
  });

  it("adds the artifact directory as the base for relative assets", () => {
    expect(injectPreviewBase("<html><head><title>Demo</title></head><body></body></html>", "https://raw.githubusercontent.com/owner/repo/main/benchmarks/demo/")).toContain('<base href="https://raw.githubusercontent.com/owner/repo/main/benchmarks/demo/">');
  });
});
