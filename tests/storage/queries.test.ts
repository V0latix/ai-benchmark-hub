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

  it("merges a validated durable snapshot without altering bundled rows", async () => {
    vi.stubEnv("VERCEL", "1");
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    const snapshot = {
      refreshedAt: "2026-07-27T00:00:00.000Z",
      runs: [imported],
      warnings: []
    };
    const readImports = createImportedRunsReader(async () => snapshot, {
      now: () => Date.parse("2026-07-27T00:00:01.000Z")
    });

    const fresh = await getCache(readImports);

    expect(fresh.runs).toHaveLength(236);
    expect(fresh.runs.at(-1)).toEqual(imported);
    expect(fresh.freshnessWarnings).toEqual([]);
  });

  it("keeps all 235 bundled rows and exposes a warning when the durable cache has no first value", async () => {
    vi.stubEnv("VERCEL", "1");
    const readImports = createImportedRunsReader(async () => {
      throw new Error("cold cache");
    });

    const cache = await getCache(readImports);

    expect(cache.runs).toEqual(readBundledSnapshot().runs);
    expect(cache.runs).toHaveLength(235);
    expect(cache.freshnessWarnings).toEqual(["Unable to refresh imported runs"]);
  });
});
