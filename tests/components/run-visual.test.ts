import { describe, expect, it } from "vitest";

import { getRunVisual } from "../../src/components/run-visual";
import type { NormalizedRun } from "../../src/lib/sources/types";

const run = (overrides: Partial<NormalizedRun>) => ({ sourceRepo: "owner/repo", sourceId: "source", screenshotPath: null, previewPath: null, ...overrides }) as NormalizedRun;

describe("getRunVisual", () => {
  it("uses a screenshot before an HTML preview", () => {
    expect(getRunVisual(run({ screenshotPath: "reports/a.png", previewPath: "preview/index.html" }), "main"))
      .toMatchObject({ kind: "screenshot", path: "reports/a.png" });
  });

  it("returns a sandboxed preview when no screenshot exists", () => {
    expect(getRunVisual(run({ id: "run-42", task: "demo", previewPath: "benchmarks/demo/preview/index.html" }), "public"))
      .toMatchObject({ kind: "preview", url: "/api/runs/run-42/visual?interactive=2" });
  });

  it("does not show a visual belonging to a different task", () => {
    expect(getRunVisual(run({ id: "run-42", task: "gmail-clone", previewPath: "benchmarks/3d-sponge-bob/example/index.html" }), "main"))
      .toEqual({ kind: "unavailable" });
  });

  it("does not invent a visual when neither artifact is available", () => {
    expect(getRunVisual(run({}), "main")).toEqual({ kind: "unavailable" });
  });
});
