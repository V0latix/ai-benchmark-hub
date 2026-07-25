import { describe, expect, it } from "vitest";

import { transformPreviewModule } from "../../src/lib/visuals/module";

describe("preview module transform", () => {
  it("transpiles TSX and loads its CSS as a stylesheet", () => {
    const code = transformPreviewModule("import './index.css'; export const App = () => <main>Preview</main>;", "src/App.tsx");
    expect(code).toContain('new URL("./index.css", import.meta.url)');
    expect(code).toContain('from "react/jsx-runtime"');
    expect(code).not.toContain("import './index.css'");
  });
});
