import { describe, expect, it } from "vitest";

import { filterRuns } from "../../src/components/run-table";
import type { NormalizedRun } from "../../src/lib/sources/types";

const run = (id: string, overrides: Partial<NormalizedRun>) => ({ id, sourceId: "source-a", model: "model-a", harness: "harness-a", status: "success", score: 0.5, totalCostUsd: 1, durationMs: 10, createdAt: "2026-01-01T00:00:00.000Z", ...overrides }) as NormalizedRun;

describe("filterRuns", () => {
  it("filters by source, model, harness, and status", () => {
    const visible = filterRuns([run("keep", { task: "task-a" }), run("drop", { sourceId: "source-b", model: "model-b", harness: "harness-b", status: "failed", task: "task-b" })], { source: "source-a", model: "model-a", task: "task-a", harness: "harness-a", status: "success", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["keep"]);
  });

  it("requires an exact task match even when all other values match", () => {
    const visible = filterRuns([run("gmail", { task: "gmail-clone" }), run("other", { task: "figma-clone" })], { source: "source-a", model: "model-a", task: "gmail-clone", harness: "harness-a", status: "success", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["gmail"]);
  });

  it("sorts unknown costs after known costs", () => {
    const visible = filterRuns([run("unknown", { totalCostUsd: null }), run("expensive", { totalCostUsd: 2 }), run("cheap", { totalCostUsd: 1 })], { source: "", model: "", task: "", harness: "", status: "", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["expensive", "cheap", "unknown"]);
  });
});
