import { describe, expect, it } from "vitest";

import { displayRunStatus } from "../../src/lib/runs/status-display";

describe("displayRunStatus", () => {
  it.each([null, "", "  ", "unknown", " UNKNOWN "])("renders %j as an unknown status", (value) => {
    expect(displayRunStatus(value)).toBe("—");
  });

  it("keeps a real status visible", () => {
    expect(displayRunStatus("success")).toBe("success");
    expect(displayRunStatus("failed")).toBe("failed");
  });
});
