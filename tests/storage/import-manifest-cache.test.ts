import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";

const nextCache = vi.hoisted(() => ({
  unstableCache: vi.fn()
}));

vi.mock("next/cache", () => ({
  unstable_cache: nextCache.unstableCache
}));

beforeEach(() => {
  vi.resetModules();
  nextCache.unstableCache.mockReset();
});

describe("production imported-run cache", () => {
  it("wraps the validated snapshot loader in the tagged persistent Next Data Cache", async () => {
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    nextCache.unstableCache.mockImplementation(() => async () => ({
      refreshedAt: "2099-01-01T00:00:00.000Z",
      runs: [imported],
      warnings: []
    }));

    const cacheModule = await import("../../src/lib/storage/import-manifest-cache");

    expect(nextCache.unstableCache).toHaveBeenCalledTimes(1);
    expect(nextCache.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["melvynx-imported-runs-snapshot-v1"],
      { revalidate: 300, tags: ["melvynx-imports"] }
    );
    await expect(cacheModule.readImportedRuns()).resolves.toEqual({
      runs: [imported],
      warnings: []
    });
  });
});
