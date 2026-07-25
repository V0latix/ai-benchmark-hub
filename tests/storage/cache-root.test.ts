import { describe, expect, it } from "vitest";

import { getDefaultCacheRoot } from "../../src/lib/storage/json-store";

describe("getDefaultCacheRoot", () => {
  it("uses Vercel's writable temporary directory in serverless functions", () => {
    expect(getDefaultCacheRoot("/var/task", true)).toBe("/tmp/benchmark-hub");
  });

  it("keeps the local project cache path outside Vercel", () => {
    expect(getDefaultCacheRoot("/project", false)).toBe("/project/.cache/benchmark-hub");
  });
});
