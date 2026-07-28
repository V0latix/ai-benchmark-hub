import { describe, expect, it } from "vitest";

import { compilePreviewStylesheet, extractTailwindCandidates, transformPreviewModule, transformPreviewStylesheet } from "../../src/lib/visuals/module";

describe("preview module transform", () => {
  it("transpiles TSX and loads its CSS as a stylesheet", () => {
    const code = transformPreviewModule("import './index.css'; export const App = () => <main>Preview</main>;", "src/App.tsx");
    expect(code).toContain('new URL("./index.css?preview=tailwind-2", import.meta.url)');
    expect(code).toContain('from "react/jsx-runtime"');
    expect(code).not.toContain("import './index.css'");
  });

  it("loads admin module stylesheets with credentials before assigning href", () => {
    const code = transformPreviewModule(
      "import './index.css'; export const ready = true;",
      "src/App.ts",
      "v=tailwind-2",
      {
        assetBaseUrl: "/api/admin/imports/draft-1/visual/asset",
        dependencies: {},
        credentialed: true
      }
    );

    const credentials = 'previewStyle0.crossOrigin = "use-credentials"';
    const source = 'previewStyle0.href = new URL("./index.css?v=tailwind-2", import.meta.url).href';
    expect(code).toContain(credentials);
    expect(code).toContain(source);
    expect(code.indexOf(credentials)).toBeLessThan(code.indexOf(source));
  });

  it("turns Vite static asset imports into URLs served by the preview proxy", () => {
    const code = transformPreviewModule("import hero from './assets/hero.png'; export const App = () => <img src={hero} />;", "src/App.tsx");

    expect(code).toContain('const hero = new URL("./assets/hero.png", import.meta.url).href;');
    expect(code).not.toContain("from './assets/hero.png'");
  });

  it("resolves Vite @ aliases relative to the proxied source module", () => {
    const code = transformPreviewModule('import { cn } from "@/lib/utils"; export const Button = () => <button className={cn("a")} />;', "src/components/ui/button.tsx");

    expect(code).toContain('from "../../lib/utils"');
    expect(code).not.toContain('from "@/lib/utils"');
  });

  it("resolves @ aliases when the proxy passes the full GitHub artifact path", () => {
    const code = transformPreviewModule('import { cn } from "@/lib/utils"; export const Button = () => <button className={cn("a")} />;', "benchmarks/gmail-clone/run/src/components/ui/button.tsx");

    expect(code).toContain('from "../../lib/utils"');
    expect(code).not.toContain("../../../../../../src/lib/utils");
  });

  it("removes the Vite-only Tailwind import from a stylesheet", () => {
    expect(transformPreviewStylesheet('@import "tailwindcss";\n:root { color: red; }')).toBe(':root { color: red; }');
  });

  it("compiles Tailwind utilities found in the benchmark source", async () => {
    expect(extractTailwindCandidates('const card = "flex gap-4 bg-red-500"')).toEqual(expect.arrayContaining(["flex", "gap-4", "bg-red-500"]));
    expect(await compilePreviewStylesheet('@import "tailwindcss";', ["flex", "gap-4", "bg-red-500"])).toContain(".bg-red-500");
  });

  it("compiles Tailwind styles without executing an artifact plugin", async () => {
    const stylesheet = await compilePreviewStylesheet('@import "tailwindcss"; @plugin "tailwindcss-animate";', ["flex"]);

    expect(stylesheet).toContain(".flex");
  });
});
