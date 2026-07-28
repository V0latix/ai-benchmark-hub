import { describe, expect, it } from "vitest";

import melvynxSnapshot from "../../src/data/melvynx-runs.snapshot.json";
import {
  getMelvynxTaskPrompt,
  isMelvynxTask,
  MELVYNX_TASKS
} from "../../src/lib/tasks/catalog";
import type { NormalizedRun } from "../../src/lib/sources/types";

describe("Melvynx task prompt catalog", () => {
  it("derives the complete sorted read-only task catalog from the bundled snapshot", () => {
    const snapshotTasks = [...new Set(
      (melvynxSnapshot as NormalizedRun[])
        .map((run) => run.task)
        .filter((task): task is string => Boolean(task))
    )].sort();

    expect(MELVYNX_TASKS).toEqual(snapshotTasks);
    expect(MELVYNX_TASKS).toHaveLength(22);
    expect(MELVYNX_TASKS).toEqual(expect.arrayContaining([
      "harness-smoke",
      "openclaw-benchmark"
    ]));
    expect(Object.isFrozen(MELVYNX_TASKS)).toBe(true);
  });

  it("maps run task slugs to their canonical prompt path", () => {
    expect(getMelvynxTaskPrompt("3d-sponge-bob")).toMatchObject({ slug: "spongebob-3d-world-threejs", path: "prompts/spongebob-3d-world-threejs/v2.md" });
  });

  it("keeps prompt lookup optional while guarding every existing task", () => {
    expect(isMelvynxTask("harness-smoke")).toBe(true);
    expect(isMelvynxTask("openclaw-benchmark")).toBe(true);
    expect(getMelvynxTaskPrompt("harness-smoke")).toBeNull();
    expect(getMelvynxTaskPrompt("unknown-task")).toBeNull();
    expect(isMelvynxTask("unknown-task")).toBe(false);
  });
});
