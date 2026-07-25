import { describe, expect, it } from "vitest";

import { parseSyncArgs } from "../../src/lib/sources/cli";

describe("parseSyncArgs", () => {
  it("parses a selected source and force flag", () => {
    expect(parseSyncArgs(["--source", "melvynx-benchmarks", "--force"]))
      .toEqual({ sourceId: "melvynx-benchmarks", force: true });
  });

  it("rejects a source flag without an id", () => {
    expect(() => parseSyncArgs(["--source"])).toThrow("Missing source id");
  });
});
