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

  it("sets credentialed CORS before the admin Vite entry URL without changing the opaque sandbox", () => {
    const html = injectInteractivePreview(
      '<html><body><script type="module" src="/src/main.tsx"></script></body></html>',
      "/api/admin/imports/draft-1/visual/asset",
      {},
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );

    const credentials = 'previewEntry.crossOrigin = "use-credentials"';
    const source = 'previewEntry.src = "/api/admin/imports/draft-1/visual/asset/src/main.tsx?v=tailwind-2"';
    expect(html).toContain(credentials);
    expect(html).toContain(source);
    expect(html.indexOf(credentials)).toBeLessThan(html.indexOf(source));
    expect(interactivePreviewSandbox).toBe("allow-scripts");
  });

  it("keeps standalone HTML modules and does not add a Vite entrypoint", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link rel="modulepreload" href="./assets/chunk.js">
        <link rel="stylesheet" href="./assets/app.css">
      </head><body>
        <script type="module" src="./assets/app.js"></script>
        <script type="module">import "three";</script>
      </body></html>`,
      "/api/runs/run-42/visual/asset"
    );
    expect(html).toContain('import "three";');
    expect(html).toContain("previewStorage");
    expect(html).not.toContain("src/main.tsx");
    expect(html).not.toContain("previewEntry");
    expect(html).not.toContain('crossorigin="use-credentials"');
  });

  it("credentials every admin standalone module and local preload or stylesheet before its URL", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link href="./assets/app.js" rel="modulepreload" crossorigin="anonymous">
        <link rel="stylesheet" href="./assets/app.css">
      </head><body>
        <script defer src="./assets/app.js" type="module" crossorigin="anonymous"></script>
        <script type="module" crossorigin="use-credentials">import "./assets/inline.js";</script>
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html);
    const moduleScripts = [...dom.window.document.querySelectorAll<HTMLScriptElement>('script[type="module"]')];
    const credentialedLinks = [...dom.window.document.querySelectorAll<HTMLLinkElement>('link[rel~="modulepreload"], link[rel~="stylesheet"]')];

    expect(moduleScripts).toHaveLength(2);
    expect(credentialedLinks).toHaveLength(2);
    for (const element of [...moduleScripts, ...credentialedLinks]) {
      expect(element.getAttribute("crossorigin")).toBe("use-credentials");
      expect(element.outerHTML.match(/\bcrossorigin\b/gi)).toHaveLength(1);
    }
    for (const element of moduleScripts.filter((script) => script.hasAttribute("src"))) {
      expect(element.outerHTML.indexOf("crossorigin=")).toBeLessThan(element.outerHTML.indexOf("src="));
    }
    for (const element of credentialedLinks) {
      expect(element.outerHTML.indexOf("crossorigin=")).toBeLessThan(element.outerHTML.indexOf("href="));
    }
    expect(moduleScripts[1]?.textContent).toContain('import "./assets/inline.js";');
  });

  it("parses quoted tag closers and mixed attribute syntax while keeping standalone readiness", async () => {
    const messages: unknown[] = [];
    const html = injectStandalonePreview(
      `<html><head>
        <link data-label='preload 1 > 0' REL=modulepreload HREF='./assets/chunk.js' crossorigin='anonymous'>
        <link REL='stylesheet' data-label="href=keep.css crossorigin=keep 2 > 1" HREF='./assets/app.css'>
      </head><body>
        Math: 1 < 2
        <script
          data-label="1 > 0 type=classic src=ignored.js crossorigin=ignored"
          TYPE='module'
          crossorigin='anonymous'
          SRC='./assets/app.js'
          data-source='src=keep.js crossorigin=keep'
        ></script>
        <script data-label='type=classic src=fake.js crossorigin=fake 3 > 2' TYPE=module>
          import "/api/admin/imports/draft-1/visual/asset/assets/inline.js?v=tailwind-2";
        </script>
      </body></html>`,
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
    const external = dom.window.document.querySelector<HTMLScriptElement>('script[src*="assets/app.js"]');
    const inline = [...dom.window.document.querySelectorAll<HTMLScriptElement>('script[type="module"]')]
      .find((script) => !script.hasAttribute("src"));
    const preload = dom.window.document.querySelector<HTMLLinkElement>('link[rel~="modulepreload"]');
    const stylesheet = dom.window.document.querySelector<HTMLLinkElement>('link[rel~="stylesheet"]');

    expect(external?.getAttribute("src")).toBe("/api/admin/imports/draft-1/visual/asset/assets/app.js?v=tailwind-2");
    expect(external?.getAttribute("crossorigin")).toBe("use-credentials");
    expect(external?.getAttribute("data-label")).toBe("1 > 0 type=classic src=ignored.js crossorigin=ignored");
    expect(external?.getAttribute("data-source")).toBe("src=keep.js crossorigin=keep");
    expect(inline?.getAttribute("crossorigin")).toBe("use-credentials");
    expect(inline?.textContent).toContain('import "/api/admin/imports/draft-1/visual/asset/assets/inline.js?v=tailwind-2";');
    expect(preload?.getAttribute("href")).toBe("/api/admin/imports/draft-1/visual/asset/assets/chunk.js?v=tailwind-2");
    expect(preload?.getAttribute("crossorigin")).toBe("use-credentials");
    expect(preload?.getAttribute("data-label")).toBe("preload 1 > 0");
    expect(stylesheet?.getAttribute("href")).toBe("/api/admin/imports/draft-1/visual/asset/assets/app.css?v=tailwind-2");
    expect(stylesheet?.getAttribute("crossorigin")).toBe("use-credentials");
    expect(stylesheet?.getAttribute("data-label")).toBe("href=keep.css crossorigin=keep 2 > 1");

    dom.window.dispatchEvent(new dom.window.Event("load"));
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
      source: dom.window,
      data: {
        type: adminPreviewInitMessageType,
        nonce: "cd".repeat(16),
        generation: 4
      }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(messages).toContainEqual({
      type: adminPreviewMessageType,
      state: "ready",
      nonce: "cd".repeat(16),
      generation: 4
    });
    dom.window.close();
  });

  it("safely quotes and proxies real unquoted admin module resource URLs", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link REL=modulepreload HREF=./assets/chunk.js>
        <link REL=stylesheet HREF=./assets/app.css>
      </head><body>
        <script TYPE=module SRC=./assets/app.js></script>
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2&theme=dark",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html);
    const external = dom.window.document.querySelector<HTMLScriptElement>('script[type="module"]');
    const preload = dom.window.document.querySelector<HTMLLinkElement>('link[rel~="modulepreload"]');
    const stylesheet = dom.window.document.querySelector<HTMLLinkElement>('link[rel~="stylesheet"]');
    const openingTags = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /\b(?:SRC|HREF)=/i.test(tag));

    expect(external?.getAttribute("src")).toBe("/api/admin/imports/draft-1/visual/asset/assets/app.js?v=tailwind-2&theme=dark");
    expect(preload?.getAttribute("href")).toBe("/api/admin/imports/draft-1/visual/asset/assets/chunk.js?v=tailwind-2&theme=dark");
    expect(stylesheet?.getAttribute("href")).toBe("/api/admin/imports/draft-1/visual/asset/assets/app.css?v=tailwind-2&theme=dark");
    for (const element of [external, preload, stylesheet]) {
      expect(element?.getAttribute("crossorigin")).toBe("use-credentials");
    }
    for (const tag of openingTags) {
      const url = /\bSRC=/i.test(tag) ? tag.indexOf("SRC=") : tag.indexOf("HREF=");
      expect(tag.indexOf('crossorigin="use-credentials"')).toBeLessThan(url);
      expect(tag).toContain("&amp;theme=dark");
    }
    dom.window.close();
  });

  it("proxies valid unquoted public standalone URLs without adding credentials", () => {
    const html = injectStandalonePreview(
      `<html><head><link rel=modulepreload href=./assets/chunk.js></head><body>
        <script type=module src=./assets/app.js></script>
      </body></html>`,
      "/api/runs/run-42/visual/asset"
    );
    const dom = new JSDOM(html);
    const external = dom.window.document.querySelector<HTMLScriptElement>('script[type="module"]');
    const preload = dom.window.document.querySelector<HTMLLinkElement>('link[rel~="modulepreload"]');

    expect(external?.getAttribute("src")).toBe("/api/runs/run-42/visual/asset/assets/app.js");
    expect(preload?.getAttribute("href")).toBe("/api/runs/run-42/visual/asset/assets/chunk.js");
    expect(external?.hasAttribute("crossorigin")).toBe(false);
    expect(preload?.hasAttribute("crossorigin")).toBe(false);
    dom.window.close();
  });

  it("ignores module attribute names embedded in unrelated tag values", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link data-label='keep rel=modulepreload href="./fake.js" crossorigin="anonymous"' rel="icon" href="./icon.svg">
      </head><body>
        <script data-label='keep type=module src="./fake.js" crossorigin="anonymous"' src="./classic.js"></script>
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html);
    const icon = dom.window.document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const classic = dom.window.document.querySelector<HTMLScriptElement>("script[src]");

    expect(icon?.getAttribute("data-label")).toBe('keep rel=modulepreload href="./fake.js" crossorigin="anonymous"');
    expect(icon?.hasAttribute("crossorigin")).toBe(false);
    expect(classic?.getAttribute("data-label")).toBe('keep type=module src="./fake.js" crossorigin="anonymous"');
    expect(classic?.hasAttribute("crossorigin")).toBe(false);
  });

  it("preserves comments, doctype, and raw script content while credentialing the real module", () => {
    const comment = '<!-- <script type="module" src="./comment.js" crossorigin="anonymous"></script> -->';
    const rawLink = '<link rel="modulepreload" href="./raw.js" crossorigin="anonymous">';
    const html = injectStandalonePreview(
      `<!doctype html><html><head>${comment}</head><body>
        <script type="module">const rawLink = ${JSON.stringify(rawLink)};</script>
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html);
    const moduleScript = dom.window.document.querySelector<HTMLScriptElement>('script[type="module"]');

    expect(dom.window.document.doctype?.name).toBe("html");
    expect(html).toContain(comment);
    expect(moduleScript?.getAttribute("crossorigin")).toBe("use-credentials");
    expect(moduleScript?.textContent).toContain(`const rawLink = ${JSON.stringify(rawLink)};`);
    dom.window.close();
  });

  it("lowercases each large document at most once per scanner pass", () => {
    const fixture = `<html><body>${'<script type=module>globalThis.__largeFixture = true;</script>'.repeat(20_000)}</body></html>`;
    const originalLowerCase = String.prototype.toLowerCase;
    let largeCalls = 0;
    let cachedSource = "";
    let cachedResult = "";
    const lowerCase = vi.spyOn(String.prototype, "toLowerCase").mockImplementation(function (this: string) {
      const source = String(this);
      if (source.length >= fixture.length) {
        largeCalls += 1;
        if (source === cachedSource) return cachedResult;
        cachedSource = source;
        cachedResult = originalLowerCase.call(source);
        return cachedResult;
      }
      return originalLowerCase.call(source);
    });
    let html = "";
    try {
      html = injectStandalonePreview(
        fixture,
        "/api/admin/imports/draft-1/visual/asset",
        "v=tailwind-2",
        { nonce: "cd".repeat(16) }
      );
    } finally {
      lowerCase.mockRestore();
    }

    expect(largeCalls).toBeLessThanOrEqual(2);
    expect(html.match(/crossorigin="use-credentials"/g)).toHaveLength(20_000);
  }, 5_000);

  it("does not duplicate credentials already present on admin standalone module resources", () => {
    const html = injectStandalonePreview(
      `<html><head>
        <link crossorigin="use-credentials" rel="modulepreload" href="./assets/app.js">
        <link crossorigin="use-credentials" rel="stylesheet" href="./assets/app.css">
      </head><body>
        <script crossorigin="use-credentials" type="module" src="./assets/app.js"></script>
        <script crossorigin="use-credentials" type="module">import "./assets/inline.js";</script>
      </body></html>`,
      "/api/admin/imports/draft-1/visual/asset",
      "v=tailwind-2",
      { nonce: "cd".repeat(16) }
    );
    const dom = new JSDOM(html);
    const credentialed = dom.window.document.querySelectorAll(
      'script[type="module"], link[rel~="modulepreload"], link[rel~="stylesheet"]'
    );
    const rawResourceTags = [...html.matchAll(/<(?:script|link)\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => (
        tag.includes('type="module"')
        || tag.includes('rel="modulepreload"')
        || tag.includes('rel="stylesheet"')
      ));

    expect(credentialed).toHaveLength(4);
    expect(rawResourceTags).toHaveLength(4);
    for (const element of credentialed) {
      expect(element.getAttribute("crossorigin")).toBe("use-credentials");
    }
    for (const tag of rawResourceTags) {
      expect(tag.match(/\bcrossorigin\b/gi)).toHaveLength(1);
    }
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
