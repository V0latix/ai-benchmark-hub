import { describe, expect, it } from "vitest";

import { makeNormalizedRun } from "../fixtures/normalized-run";
import { buildTaskCards, buildTaskDetail, resolveComparison, taskFromRouteParam } from "../../src/lib/tasks/view-model";

const run = makeNormalizedRun;

describe("buildTaskCards", () => {
  it("groups by task, counts unique models, and prefers a run with a preview", () => {
    const cards = buildTaskCards([
      run("a", { task: "gmail-clone", model: "model-a", previewPath: null }),
      run("b", { task: "gmail-clone", model: "model-b", previewPath: "benchmarks/gmail-clone/b/index.html" })
    ]);

    expect(cards[0]).toMatchObject({
      task: "gmail-clone",
      runCount: 2,
      modelCount: 2,
      representativeRunId: "b"
    });
  });

  it("ignores a nonempty preview path outside the task preview directory", () => {
    const cards = buildTaskCards([
      run("invalid", { task: "gmail-clone", previewPath: "foo.html", createdAt: "2026-02-01T00:00:00Z" }),
      run("valid", { task: "gmail-clone", previewPath: "benchmarks/gmail-clone/valid/index.html", createdAt: "2026-01-01T00:00:00Z" })
    ]);

    expect(cards[0].representativeRunId).toBe("valid");
  });

  it("excludes run ids shared across tasks from representative previews", () => {
    const cards = buildTaskCards([
      run("shared", { task: "3d-sponge-bob", previewPath: "benchmarks/3d-sponge-bob/shared/index.html" }),
      run("shared", { task: "timezone-checker", previewPath: "benchmarks/timezone-checker/shared/index.html" }),
      run("timezone-safe", { task: "timezone-checker", previewPath: "benchmarks/timezone-checker/safe/index.html" })
    ]);

    expect(cards).toMatchObject([
      { task: "3d-sponge-bob", representativeRunId: null },
      { task: "timezone-checker", representativeRunId: "timezone-safe" }
    ]);
  });

  it("does not fall back to a run without a preview", () => {
    const cards = buildTaskCards([
      run("result-only", { task: "thumbfast", previewPath: null, resultPath: "results/thumbfast.md" })
    ]);

    expect(cards[0].representativeRunId).toBeNull();
  });

  it("matches either a task name or one of its model names", () => {
    const cards = buildTaskCards([run("a", { task: "gmail-clone", model: "claude-sonnet-5" })], "sonnet");

    expect(cards.map((card) => card.task)).toEqual(["gmail-clone"]);
  });

  it("sorts tasks and models alphabetically", () => {
    const cards = buildTaskCards([
      run("b", { task: "gmail-clone", model: "zeta" }),
      run("a", { task: "figma-clone", model: "alpha" }),
      run("c", { task: "gmail-clone", model: "beta" })
    ]);

    expect(cards).toMatchObject([
      { task: "figma-clone", models: ["alpha"] },
      { task: "gmail-clone", models: ["beta", "zeta"] }
    ]);
  });
});

describe("buildTaskDetail", () => {
  it("keeps unknown values and puts unknown dates after known runs", () => {
    const detail = buildTaskDetail([
      run("unknown", { task: "gmail-clone", model: null, createdAt: null }),
      run("old", { task: "gmail-clone", model: "model-a", createdAt: "2026-01-01T00:00:00Z" }),
      run("new", { task: "gmail-clone", model: "model-a", createdAt: "2026-02-01T00:00:00Z" })
    ], "gmail-clone");

    expect(detail?.runs.map((item) => item.id)).toEqual(["new", "old", "unknown"]);
    expect(detail?.runs[2].model).toBeNull();
  });

  it("returns null when the requested task has no runs", () => {
    expect(buildTaskDetail([run("a")], "figma-clone")).toBeNull();
  });

  it("keeps colliding runs visible and reports their ids as ambiguous", () => {
    const detail = buildTaskDetail([
      run("shared", { task: "3d-sponge-bob", previewPath: "benchmarks/3d-sponge-bob/shared/index.html" }),
      run("shared", { task: "timezone-checker", previewPath: "benchmarks/timezone-checker/shared/index.html" })
    ], "timezone-checker");

    expect(detail?.runs.map((item) => item.id)).toEqual(["shared"]);
    expect(detail?.ambiguousRunIds).toEqual(["shared"]);
  });
});

describe("taskFromRouteParam", () => {
  it("preserves literal percent escape text from an already-decoded route param", () => {
    expect(taskFromRouteParam("literal%2Ftask")).toBe("literal%2Ftask");
  });
});

describe("resolveComparison", () => {
  it("chooses the newest run for the first two distinct models in one task", () => {
    const selection = resolveComparison([
      run("a-old", { task: "gmail-clone", model: "model-a", createdAt: "2026-01-01T00:00:00Z" }),
      run("a-new", { task: "gmail-clone", model: "model-a", createdAt: "2026-02-01T00:00:00Z" }),
      run("b", { task: "gmail-clone", model: "model-b" }),
      run("other", { task: "figma-clone", model: "model-c" })
    ], { task: "gmail-clone" });

    expect(selection).toMatchObject({ task: "gmail-clone", leftId: "a-new", rightId: "b" });
  });

  it("clears ids that do not belong to the selected task or duplicate the same run", () => {
    const selection = resolveComparison([
      run("gmail-a", { task: "gmail-clone", model: "model-a" }),
      run("gmail-b", { task: "gmail-clone", model: "model-b" }),
      run("figma", { task: "figma-clone", model: "model-c" })
    ], { task: "gmail-clone", leftId: "figma", rightId: "figma" });

    expect(selection).toMatchObject({ leftId: "gmail-a", rightId: "gmail-b" });
  });

  it("keeps task-scoped colliding runs selectable and marks their global ids as ambiguous", () => {
    const selection = resolveComparison([
      run("shared", { task: "gmail-clone", model: "model-a" }),
      run("safe", { task: "gmail-clone", model: "model-b" }),
      run("shared", { task: "figma-clone", model: "other-model" })
    ], { task: "gmail-clone", leftId: "shared", rightId: "safe" });

    expect(selection).toMatchObject({
      task: "gmail-clone",
      leftId: "shared",
      rightId: "safe",
      ambiguousRunIds: ["shared"]
    });
    expect(selection.models.flatMap(({ runs }) => runs).map(({ id }) => id)).toContain("shared");
  });
});
