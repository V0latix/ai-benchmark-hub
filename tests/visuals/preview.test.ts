import { describe, expect, it } from "vitest";

import { getPreviewAssetUrl, getPreviewProxyUrl, injectInteractivePreview, injectPreviewBase, interactivePreviewCorsHeaders, interactivePreviewCsp, interactivePreviewSandbox } from "../../src/lib/visuals/preview";

describe("safe HTML previews", () => {
  it("uses an internal URL rather than framing raw GitHub content", () => {
    expect(getPreviewProxyUrl("run/42")).toBe("/api/runs/run%2F42/visual?interactive=2");
  });

  it("adds the artifact directory as the base for relative assets", () => {
    expect(injectPreviewBase("<html><head><title>Demo</title></head><body></body></html>", "https://raw.githubusercontent.com/owner/repo/main/benchmarks/demo/")).toContain('<base href="https://raw.githubusercontent.com/owner/repo/main/benchmarks/demo/">');
  });

  it("permits scripts while keeping the preview in an opaque sandbox", () => {
    expect(interactivePreviewSandbox).toBe("allow-scripts");
    expect(interactivePreviewSandbox).not.toContain("allow-same-origin");
    expect(interactivePreviewCsp).toContain("script-src 'self' http: https: 'unsafe-inline'");
    expect(interactivePreviewCsp).not.toContain("sandbox");
    expect(interactivePreviewCorsHeaders).toEqual({ "Access-Control-Allow-Origin": "*" });
  });

  it("replaces a Vite entrypoint with a proxied module and import map", () => {
    const html = injectInteractivePreview('<html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>', "/api/runs/run-42/visual/asset", { react: "19.1.0" });
    expect(html).toContain('previewEntry.src = "/api/runs/run-42/visual/asset/src/main.tsx?preview=tailwind-2"');
    expect(html).toContain('"react":"https://esm.sh/react@19.1.0"');
    expect(html).toContain("previewStorage");
    expect(html).toContain("previewBootstrap");
    expect(html).toContain("previewError");
    expect(html).not.toContain('src="/src/main.tsx"');
    expect(getPreviewAssetUrl("run/42", "src/main.tsx")).toBe("/api/runs/run%2F42/visual/asset/src/main.tsx?preview=tailwind-2");
  });
});
