import { describe, expect, it } from "vitest";

import { parseMarkdownFacts } from "../../src/lib/normalize/markdown";

describe("parseMarkdownFacts", () => {
  it("reads simple label/value facts from Markdown", () => {
    expect(parseMarkdownFacts("- Model: GPT-5\n- Score: 82%"))
      .toEqual({ model: "GPT-5", score: "82%" });
  });
});
