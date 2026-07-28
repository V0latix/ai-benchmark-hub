import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import {
  adminPreviewInitMessageType,
  adminPreviewMessageType,
  getPreviewAssetUrl,
  getPreviewProxyUrl,
  injectInteractivePreview,
  injectPreviewBase,
  injectStandalonePreview,
  interactivePreviewCorsHeaders,
  interactivePreviewCsp,
  interactivePreviewSandbox
} from "../../src/lib/visuals/preview";

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

  it("replaces a Vite entrypoint with proxied modules and local React runtime imports", () => {
    const html = injectInteractivePreview('<html><head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>', "/api/runs/run-42/visual/asset", { react: "^19.2.7" });
    expect(html).toContain('previewEntry.src = "/api/runs/run-42/visual/asset/src/main.tsx?preview=tailwind-2"');
    expect(html).toContain('"react":"/api/runs/run-42/visual/vendor/react@%5E19.2.7"');
    expect(html).toContain('"react/":"/api/runs/run-42/visual/vendor/react@%5E19.2.7/"');
    expect(html).not.toContain("https://esm.sh/");
    expect(html).toContain("previewStorage");
    expect(html).toContain("previewBootstrap");
    expect(html).toContain("previewError");
    expect(html).not.toContain('src="/src/main.tsx"');
    expect(getPreviewAssetUrl("run/42", "src/main.tsx")).toBe("/api/runs/run%2F42/visual/asset/src/main.tsx?preview=tailwind-2");
  });

  it("keeps standalone HTML modules and does not add a Vite entrypoint", () => {
    const html = injectStandalonePreview('<html><head></head><body><script type="module">import "three";</script></body></html>', "/api/runs/run-42/visual/asset");
    expect(html).toContain('import "three";');
    expect(html).toContain("previewStorage");
    expect(html).not.toContain("src/main.tsx");
    expect(html).not.toContain("previewEntry");
  });

  it("proxies root and ordinary relative HTML assets while preserving query/hash and inert URLs", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link href="./style.css?theme=dark#sheet">
        <script src="assets/app.js"></script>
      </head><body>
        <img src="/hero.png?size=2#photo">
        <a href="#details">Details</a>
        <img src="data:image/png;base64,AA">
        <img src="blob:https://hub.example/id">
        <a href="mailto:test@example.com">Mail</a>
        <script src="https://example.com/app.js"></script>
        <img src="//example.com/image.png">
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2"
    );

    expect(html).toContain('href="/api/admin/imports/draft-1/visual/asset/style.css?theme=dark&v=tailwind-2#sheet"');
    expect(html).toContain('src="/api/admin/imports/draft-1/visual/asset/assets/app.js?v=tailwind-2"');
    expect(html).toContain('src="/api/admin/imports/draft-1/visual/asset/hero.png?size=2&v=tailwind-2#photo"');
    for (const untouched of [
      'href="#details"',
      'src="data:image/png;base64,AA"',
      'src="blob:https://hub.example/id"',
      'href="mailto:test@example.com"',
      'src="https://example.com/app.js"',
      'src="//example.com/image.png"'
    ]) {
      expect(html).toContain(untouched);
    }
  });

  it("fails closed when a relative HTML URL escapes the artifact root", () => {
    expect(() => injectStandalonePreview(
      '<html><body><script src="../outside.js"></script></body></html>',
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2"
    )).toThrow(/outside|relative|root/i);
  });

  it("posts authenticated standalone readiness only after load and reports runtime errors", async () => {
    const messages: unknown[] = [];
    const html = injectStandalonePreview(
      "<html><head></head><body><main>Ready</main></body></html>",
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://hub.example/api/admin/imports/draft-1/visual",
      beforeParse(window) {
        window.postMessage = vi.fn((message: unknown) => {
          messages.push(message);
        }) as typeof window.postMessage;
      }
    });

    dom.window.dispatchEvent(new dom.window.Event("load"));
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window,
      data: {
        type: adminPreviewInitMessageType,
        nonce: "cd".repeat(16),
        generation: 3
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages).toContainEqual({
      type: adminPreviewMessageType,
      state: "ready",
      nonce: "cd".repeat(16),
      generation: 3
    });

    dom.window.dispatchEvent(new dom.window.ErrorEvent("error", { message: "runtime failed" }));
    expect(messages).toContainEqual({
      type: adminPreviewMessageType,
      state: "error",
      nonce: "cd".repeat(16),
      generation: 3
    });
    dom.window.close();
  });
});
