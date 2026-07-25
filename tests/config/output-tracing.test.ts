import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

describe("production output tracing", () => {
  it("includes Tailwind's stylesheet for the interactive preview route", () => {
    expect(nextConfig.outputFileTracingIncludes?.["/api/runs/\\[id\\]/visual/asset/\\[\\.\\.\\.path\\]"])
      .toContain("./node_modules/tailwindcss/index.css");
  });
});
