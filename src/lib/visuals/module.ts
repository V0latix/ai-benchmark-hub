import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

import { compile } from "tailwindcss";
import ts from "typescript";

const cssImport = /import\s+["']([^"']+\.css)["'];?/g;
const require = createRequire(join(process.cwd(), "package.json"));

export function transformPreviewModule(source: string, path: string): string {
  const styles = [...source.matchAll(cssImport)].map((match) => match[1]);
  const withoutStyles = source.replace(cssImport, "");
  const loader = path.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve;
  const transformed = ts.transpileModule(withoutStyles, { compilerOptions: { jsx: loader, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const styleLoader = styles.map((style, index) => `const previewStyle${index} = document.createElement("link"); previewStyle${index}.rel = "stylesheet"; previewStyle${index}.href = new URL(${JSON.stringify(style)}, import.meta.url).href; document.head.append(previewStyle${index});`).join("\n");
  return `${styleLoader}\n${transformed}`;
}

export function transformPreviewStylesheet(source: string): string {
  return source.replace(/@import\s+["']tailwindcss["'];?\s*/g, "");
}

export function extractTailwindCandidates(source: string): string[] {
  const candidates = new Set<string>();
  for (const match of source.matchAll(/["'`]([^"'`]{1,240})["'`]/g)) for (const token of match[1].split(/\s+/)) if (/^[!\w:[\]/.%#()-]+$/i.test(token)) candidates.add(token);
  return [...candidates];
}

export async function compilePreviewStylesheet(source: string, candidates: string[]): Promise<string> {
  const tailwindStylesheet = await readFile(require.resolve("tailwindcss/index.css"), "utf8");
  const compiler = await compile(source, { loadStylesheet: async (id) => ({ path: id, base: "", content: id === "tailwindcss" ? tailwindStylesheet : "" }) });
  return compiler.build(candidates);
}
