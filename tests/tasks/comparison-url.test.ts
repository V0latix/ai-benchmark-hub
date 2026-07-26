import { describe, expect, it } from "vitest";

import { comparisonSearchSignature } from "../../src/lib/tasks/comparison-url";

describe("comparisonSearchSignature", () => {
  it("normalizes all raw keys and repeated values independently of order", () => {
    const server = comparisonSearchSignature({
      right: "run-b",
      extra: ["z", "a"],
      left: ["run-c", "run-a"],
      task: "gmail-clone"
    });
    const browser = comparisonSearchSignature(new URLSearchParams(
      "left=run-a&extra=a&task=gmail-clone&left=run-c&extra=z&right=run-b"
    ));

    expect(server).toBe(browser);
    expect(server).toBe(
      '[["extra","a"],["extra","z"],["left","run-a"],["left","run-c"],["right","run-b"],["task","gmail-clone"]]'
    );
  });
});
