import { describe, expect, it } from "vitest";

import { findNumber } from "../../src/lib/normalize/numbers";

describe("findNumber", () => {
  it("extracts nested currency values from selected keys", () => {
    expect(findNumber({ usage: { total_cost_usd: "$1.25" } }, ["total_cost_usd"])).toBe(1.25);
  });

  it("returns null rather than converting a missing metric to zero", () => {
    expect(findNumber({}, ["total_cost_usd"])).toBeNull();
  });
});
