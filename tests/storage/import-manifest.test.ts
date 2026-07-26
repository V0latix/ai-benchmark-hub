import { describe, expect, it } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";
import { mergeImportedRuns, parseImportedRunManifest } from "../../src/lib/storage/import-manifest";

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
});
