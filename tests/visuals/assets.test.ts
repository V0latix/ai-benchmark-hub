import { describe, expect, it } from "vitest";

import { getPreviewAssetContentType } from "../../src/lib/visuals/assets";

describe("preview asset content types", () => {
  it("serves binary images and fonts with their browser content types", () => {
    expect(getPreviewAssetContentType("src/assets/hero.png")).toBe("image/png");
    expect(getPreviewAssetContentType("src/assets/logo.svg")).toBe("image/svg+xml");
    expect(getPreviewAssetContentType("public/inter.woff2")).toBe("font/woff2");
  });
});
