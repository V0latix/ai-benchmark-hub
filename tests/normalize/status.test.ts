import { describe, expect, it } from "vitest";

import { normalizeStatus } from "../../src/lib/normalize/status";

describe("normalizeStatus", () => {
  it("maps timed-out text to timeout", () => {
    expect(normalizeStatus("TIMED OUT")).toBe("timeout");
  });

  it("maps passing and failing values without conflating them", () => {
    expect(normalizeStatus("pass")).toBe("success");
    expect(normalizeStatus("error")).toBe("failed");
  });
});
