import { describe, expect, it } from "vitest";

import { isSafeEsmModulePath, rewriteEsmModuleImports } from "../../src/lib/visuals/vendor";

describe("preview ESM vendor proxy", () => {
  it("keeps transitive ESM imports on the preview origin", () => {
    const source = [
      'import { jsx } from "/react@19.2.8/es2022/jsx-runtime.mjs";',
      'export * from "https://esm.sh/lucide-react@1.26.0/es2022/lucide-react.mjs";',
      'const logo = "/assets/logo.svg";'
    ].join("\n");

    const rewritten = rewriteEsmModuleImports(source, "/api/runs/run-42/visual/vendor");

    expect(rewritten).toContain('from "/api/runs/run-42/visual/vendor/react@19.2.8/es2022/jsx-runtime.mjs"');
    expect(rewritten).toContain('from "/api/runs/run-42/visual/vendor/lucide-react@1.26.0/es2022/lucide-react.mjs"');
    expect(rewritten).toContain('const logo = "/assets/logo.svg";');
  });

  it("rewrites dynamic imports while retaining the upstream query safely", () => {
    const rewritten = rewriteEsmModuleImports('const lazy = import("/scheduler@0.27.0?target=es2022");', "/api/runs/run-42/visual/vendor");

    expect(rewritten).toContain('import("/api/runs/run-42/visual/vendor/scheduler@0.27.0?upstream=target%3Des2022")');
  });

  it("accepts safe npm version ranges used by React package manifests", () => {
    expect(isSafeEsmModulePath("react@^19.2.7")).toBe(true);
    expect(isSafeEsmModulePath("react-dom@~19.2.0/client")).toBe(true);
  });

  it("rewrites minified static and side-effect imports without whitespace", () => {
    const source = 'import*as react from"/react@19.2.8/es2022/react.mjs";import"/scheduler@^0.27.0?target=es2022";';
    const rewritten = rewriteEsmModuleImports(source, "/api/runs/run-42/visual/vendor");

    expect(rewritten).toContain('from"/api/runs/run-42/visual/vendor/react@19.2.8/es2022/react.mjs"');
    expect(rewritten).toContain('import"/api/runs/run-42/visual/vendor/scheduler@%5E0.27.0?upstream=target%3Des2022"');
  });
});
