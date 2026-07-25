import { describe, expect, it } from "vitest";

import { filterRuns } from "../../src/components/run-table";
import type { NormalizedRun } from "../../src/lib/sources/types";

const run = (id: string, overrides: Partial<NormalizedRun>) => ({ id, sourceId: "source-a", model: "model-a", harness: "harness-a", status: "success", score: 0.5, totalCostUsd: 1, durationMs: 10, createdAt: "2026-01-01T00:00:00.000Z", ...overrides }) as NormalizedRun;

describe("filterRuns", () => {
  it("filters by source, model, harness, and status", () => {
    const visible = filterRuns([run("keep", {}), run("drop", { sourceId: "source-b", model: "model-b", harness: "harness-b", status: "failed" })], { source: "source-a", model: "model-a", harness: "harness-a", status: "success", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["keep"]);
  });

  it("sorts unknown costs after known costs", () => {
    const visible = filterRuns([run("unknown", { totalCostUsd: null }), run("expensive", { totalCostUsd: 2 }), run("cheap", { totalCostUsd: 1 })], { source: "", model: "", harness: "", status: "", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["expensive", "cheap", "unknown"]);
  });
});
