import { afterEach, describe, expect, it, vi } from "vitest";

import { createImportedRunsReader } from "../../src/lib/storage/import-manifest";
import { readBundledSnapshot } from "../../src/lib/storage/json-store";
import { findUniqueRunById, getCache, getTaskCards, getTaskDetail } from "../../src/lib/storage/queries";
import { makeNormalizedRun } from "../fixtures/normalized-run";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bundled snapshot query boundary", () => {
  it("does not resolve a globally ambiguous run ID to an arbitrary task", () => {
    const sharedId = "melvynx-benchmarks-20260712T171022Z-gpt-5-6-terra-codex";

    expect(findUniqueRunById(readBundledSnapshot().runs, sharedId)).toBeNull();
  });

  it("preserves all bundled rows so cross-task ids remain ambiguous to task views", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const bundled = readBundledSnapshot();
    const cache = await getCache();
    const sharedId = "melvynx-benchmarks-20260712T171022Z-gpt-5-6-terra-codex";

    expect(cache.runs).toHaveLength(235);
    expect(cache.runs).toEqual(bundled.runs);
    expect(cache.runs.every((run, index) => run === bundled.runs[index])).toBe(true);
    expect(cache.runs.filter((run) => run.id === sharedId).map((run) => run.task)).toEqual([
      "3d-sponge-bob",
      "timezone-checker"
    ]);

    const detail = await getTaskDetail("timezone-checker");
    expect(detail?.ambiguousRunIds).toContain(sharedId);

    const cards = await getTaskCards();
    expect(cards.find((card) => card.task === "timezone-checker")?.representativeRunId).not.toBe(sharedId);
  });

  it("merges the last successful live overlay when its next refresh fails", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, runs: [imported] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("offline"));
    const readImportedRuns = createImportedRunsReader();
    const readImports = () => readImportedRuns(fetcher);

    const fresh = await getCache(readImports);
    const stale = await getCache(readImports);

    expect(fresh.runs).toHaveLength(236);
    expect(fresh.runs.at(-1)).toEqual(imported);
    expect(fresh.freshnessWarnings).toEqual([]);
    expect(stale.runs).toEqual(fresh.runs);
    expect(stale.freshnessWarnings).toEqual(["Unable to refresh imported runs"]);
  });
});
