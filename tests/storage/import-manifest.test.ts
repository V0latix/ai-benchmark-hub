import { describe, expect, it, vi } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";
import {
  createImportedRunsReader,
  mergeImportedRuns,
  parseImportedRunManifest
} from "../../src/lib/storage/import-manifest";

function manifestResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status: 200
  });
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
    ["a network failure", () => Promise.reject(new Error("offline"))],
    ["malformed JSON", () => Promise.resolve(new Response("{", { status: 200 }))],
    ["an invalid schema", () => Promise.resolve(manifestResponse({ version: 2, runs: [] }))],
    ["a later 404", () => Promise.resolve(new Response(null, { status: 404 }))]
  ])("keeps the last successful imports after %s", async (_label, failedRequest) => {
    const imported = makeNormalizedRun("live-run", { task: "live-task" });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(manifestResponse({ version: 1, runs: [imported] }))
      .mockImplementationOnce(failedRequest);
    const readImportedRuns = createImportedRunsReader();

    expect(await readImportedRuns(fetcher)).toEqual({ runs: [imported], warnings: [] });
    expect(await readImportedRuns(fetcher)).toEqual({
      runs: [imported],
      warnings: ["Unable to refresh imported runs"]
    });
  });

  it("treats a first-ever 404 as an empty manifest without a warning", async () => {
    const readImportedRuns = createImportedRunsReader();

    await expect(readImportedRuns(vi.fn(async () => new Response(null, { status: 404 })))).resolves.toEqual({
      runs: [],
      warnings: []
    });
  });
});
