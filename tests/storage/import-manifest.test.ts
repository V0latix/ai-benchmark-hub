import { afterEach, describe, expect, it, vi } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";
import {
  createImportedRunsReader,
  loadImportedRunsSnapshot,
  mergeImportedRuns,
  parseImportedRunManifest,
  type ImportedRunsSnapshot
} from "../../src/lib/storage/import-manifest";

function manifestResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function createFakeDurableCache(loader: () => Promise<ImportedRunsSnapshot>) {
  let lastGood: ImportedRunsSnapshot | null = null;

  return async () => {
    try {
      lastGood = await loader();
      return lastGood;
    } catch (error) {
      if (lastGood) return lastGood;
      throw error;
    }
  };
}

describe("import manifest", () => {
  it("keeps valid Melvynx runs and drops invalid entries", () => {
    const parsed = parseImportedRunManifest({ version: 1, runs: [makeNormalizedRun("ok"), { id: "bad" }] });

    expect(parsed.runs.map((item) => item.id)).toEqual(["ok"]);
    expect(parsed.warnings).toEqual(["Skipped invalid imported run at index 1"]);
  });

  it("keeps the bundled run on an exact task-qualified identity collision", () => {
    const bundled = makeNormalizedRun("same", { task: "same-task", model: "bundled-model" });
    const imported = makeNormalizedRun("same", { task: "same-task", model: "imported-model" });

    expect(mergeImportedRuns([bundled], [imported])).toEqual([bundled]);
  });

  it("preserves bundled order and appends imported runs with new task-qualified identities", () => {
    const first = makeNormalizedRun("shared", { task: "first-task" });
    const second = makeNormalizedRun("shared", { task: "second-task" });
    const imported = makeNormalizedRun("shared", { task: "third-task" });

    expect(mergeImportedRuns([first, second], [imported])).toEqual([first, second, imported]);
  });

  it.each([
    ["a network failure", vi.fn(async () => { throw new Error("offline"); })],
    ["an HTTP failure", vi.fn(async () => new Response(null, { status: 503 }))],
    ["a 404", vi.fn(async () => new Response(null, { status: 404 }))],
    ["malformed JSON", vi.fn(async () => new Response("{", { status: 200 }))],
    ["an invalid schema", vi.fn(async () => manifestResponse({ version: 2, runs: [] }))]
  ])("rejects %s instead of producing a replacement snapshot", async (_label, fetcher) => {
    await expect(loadImportedRunsSnapshot(fetcher)).rejects.toThrow();
  });

  it("loads a validated no-store snapshot with a refresh timestamp", async () => {
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    const fetcher = vi.fn(async () => manifestResponse({ version: 1, runs: [imported] }));

    await expect(loadImportedRunsSnapshot(
      fetcher,
      () => new Date("2026-07-27T00:00:00.000Z")
    )).resolves.toEqual({
      refreshedAt: "2026-07-27T00:00:00.000Z",
      runs: [imported],
      warnings: []
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), { cache: "no-store" });
  });

  it("shares durable last-good data across distinct reader instances and warns when stale", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("must not use global fetch"); }));
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(manifestResponse({ version: 1, runs: [imported] }))
      .mockResolvedValueOnce(manifestResponse({ version: 2, runs: [] }));
    let now = Date.parse("2026-07-27T00:00:00.000Z");
    const durableCache = createFakeDurableCache(() => loadImportedRunsSnapshot(
      fetcher,
      () => new Date(now)
    ));
    const firstInstance = createImportedRunsReader(durableCache, { now: () => now });

    expect(await firstInstance()).toEqual({ runs: [imported], warnings: [] });

    now += 301_000;
    const coldInstance = createImportedRunsReader(durableCache, { now: () => now });

    expect(coldInstance).not.toBe(firstInstance);
    expect(await coldInstance()).toEqual({
      runs: [imported],
      warnings: ["Unable to refresh imported runs"]
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("adds a freshness warning when a cached snapshot is older than the threshold", async () => {
    const imported = makeNormalizedRun("live-run");
    const reader = createImportedRunsReader(async () => ({
      refreshedAt: "2026-07-27T00:00:00.000Z",
      runs: [imported],
      warnings: []
    }), {
      now: () => Date.parse("2026-07-27T00:05:01.000Z")
    });

    await expect(reader()).resolves.toEqual({
      runs: [imported],
      warnings: ["Unable to refresh imported runs"]
    });
  });

  it("falls back to bundled-only data with a warning when the first cache fill fails", async () => {
    const reader = createImportedRunsReader(async () => {
      throw new Error("cold cache");
    });

    await expect(reader()).resolves.toEqual({
      runs: [],
      warnings: ["Unable to refresh imported runs"]
    });
  });
});
