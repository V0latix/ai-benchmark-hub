import { describe, expect, it } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";
import { mergeImportedRuns, parseImportedRunManifest } from "../../src/lib/storage/import-manifest";

describe("import manifest", () => {
  it("keeps valid Melvynx runs and drops invalid entries", () => {
    const parsed = parseImportedRunManifest({ version: 1, runs: [makeNormalizedRun("ok"), { id: "bad" }] });

    expect(parsed.runs.map((item) => item.id)).toEqual(["ok"]);
    expect(parsed.warnings).toEqual(["Skipped invalid imported run at index 1"]);
  });

  it("lets an imported run replace a bundled run with the same stable id", () => {
    expect(mergeImportedRuns(
      [makeNormalizedRun("same", { task: "old-task" })],
      [makeNormalizedRun("same", { task: "new-task" })]
    )[0].task).toBe("new-task");
  });
});
