import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readCache, writeCache } from "../../src/lib/storage/json-store";
import type { NormalizedRun, SourceSyncReport } from "../../src/lib/sources/types";

let cacheRoot: string | undefined;

afterEach(async () => {
  if (cacheRoot) await rm(cacheRoot, { recursive: true, force: true });
  cacheRoot = undefined;
});

describe("JSON cache", () => {
  it("round-trips runs and a source report", async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), "benchmark-hub-"));
    const run = { id: "run-1", sourceId: "source-1" } as NormalizedRun;
    const report = { sourceId: "source-1", status: "success", runCount: 1, syncedAt: null, error: null, warnings: [] } as SourceSyncReport;

    await writeCache({ runs: [run], report: { generatedAt: "2026-07-25T00:00:00.000Z", sources: [report] } }, cacheRoot);

    await expect(readCache(cacheRoot)).resolves.toEqual({
      runs: [run],
      report: { generatedAt: "2026-07-25T00:00:00.000Z", sources: [report] }
    });
  });
});
