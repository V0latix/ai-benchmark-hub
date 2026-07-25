import { describe, expect, it } from "vitest";

import { getMelvynxTaskPrompt } from "../../src/lib/tasks/catalog";

describe("Melvynx task prompt catalog", () => {
  it("maps run task slugs to their canonical prompt path", () => {
    expect(getMelvynxTaskPrompt("3d-sponge-bob")).toMatchObject({ slug: "spongebob-3d-world-threejs", path: "prompts/spongebob-3d-world-threejs/v2.md" });
  });

  it("returns null for a task without a catalogued prompt", () => {
    expect(getMelvynxTaskPrompt("unknown-task")).toBeNull();
  });
});
