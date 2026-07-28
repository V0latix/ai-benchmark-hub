// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { filterRuns, RunTable } from "../../src/components/run-table";
import type { NormalizedRun } from "../../src/lib/sources/types";

const run = (id: string, overrides: Partial<NormalizedRun>) => ({ id, sourceId: "source-a", model: "model-a", harness: "harness-a", status: "success", score: 0.5, totalCostUsd: 1, durationMs: 10, createdAt: "2026-01-01T00:00:00.000Z", ...overrides }) as NormalizedRun;

afterEach(cleanup);

describe("filterRuns", () => {
  it("does not expose a source filter or column in the single-source inventory", () => {
    render(createElement(RunTable, { runs: [run("first", { task: "gmail-clone" })] }));

    expect(screen.queryByLabelText("Source")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Source" })).not.toBeInTheDocument();
  });

  it("withholds the global detail link for a run ID shared by different tasks", () => {
    const { container } = render(createElement(RunTable, {
      runs: [
        run("shared", { task: "gmail-clone" }),
        run("shared", { task: "figma-clone" })
      ]
    }));

    expect(within(container).queryByRole("link", { name: "Voir le run" })).not.toBeInTheDocument();
    expect(within(container).getAllByText("ID ambigu")).toHaveLength(2);
  });

  it("shows unknown status as a dash while keeping real statuses", () => {
    const { container } = render(createElement(RunTable, {
      runs: [
        run("unknown-status", { task: "gmail-clone", status: "unknown", previewPath: "benchmarks/gmail-clone/index.html" }),
        run("success-status", { task: "figma-clone", status: "success", previewPath: "benchmarks/figma-clone/index.html" })
      ]
    }));
    const [, unknownRow, successRow] = within(container).getAllByRole("row");

    expect(within(unknownRow).getByText("—")).toBeInTheDocument();
    expect(within(container).queryByText("unknown")).not.toBeInTheDocument();
    expect(within(successRow).getByText("success")).toBeInTheDocument();
  });

  it("filters by model, task, harness, and status", () => {
    const visible = filterRuns([run("keep", { task: "task-a" }), run("drop", { sourceId: "source-b", model: "model-b", harness: "harness-b", status: "failed", task: "task-b" })], { model: "model-a", task: "task-a", harness: "harness-a", status: "success", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["keep"]);
  });

  it("requires an exact task match even when all other values match", () => {
    const visible = filterRuns([run("gmail", { task: "gmail-clone" }), run("other", { task: "figma-clone" })], { model: "model-a", task: "gmail-clone", harness: "harness-a", status: "success", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["gmail"]);
  });

  it("sorts unknown costs after known costs", () => {
    const visible = filterRuns([run("unknown", { totalCostUsd: null }), run("expensive", { totalCostUsd: 2 }), run("cheap", { totalCostUsd: 1 })], { model: "", task: "", harness: "", status: "", search: "", sort: "cost" });
    expect(visible.map((item) => item.id)).toEqual(["expensive", "cheap", "unknown"]);
  });
});
