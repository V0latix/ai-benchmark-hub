import { describe, expect, it } from "vitest";

import { benchmarkSources } from "../../src/lib/sources/config";
import { isAllowedPath } from "../../src/lib/github/paths";

const melvynx = benchmarkSources.find((source) => source.id === "melvynx-benchmarks");

describe("isAllowedPath", () => {
  it("accepts a configured metadata file", () => {
    expect(melvynx).toBeDefined();
    expect(isAllowedPath(melvynx!, "runs/2026/run-1/data/metadata.json")).toBe(true);
  });

  it("rejects credentials and traversal even when a path resembles an allowed file", () => {
    expect(isAllowedPath(melvynx!, ".env")).toBe(false);
    expect(isAllowedPath(melvynx!, "runs/../.env")).toBe(false);
  });
});
