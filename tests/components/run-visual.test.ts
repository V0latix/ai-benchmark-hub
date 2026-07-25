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
    expect(getRunVisual(run({ previewPath: "preview/index.html" }), "public"))
      .toMatchObject({ kind: "preview", url: "https://raw.githubusercontent.com/owner/repo/public/preview/index.html" });
  });

  it("does not invent a visual when neither artifact is available", () => {
    expect(getRunVisual(run({}), "main")).toEqual({ kind: "unavailable" });
  });
});
