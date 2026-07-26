import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix } from "node:path";

import { compile } from "tailwindcss";
import ts from "typescript";

import { previewAssetVersion } from "./preview";

const cssImport = /import\s+["']([^"']+\.css)["'];?/g;
const assetImport = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']((?:\.{1,2}\/)[^"']+\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|woff2?|ttf|otf))["'];?/gi;
const tailwindPlugin = /@plugin\s+["'][^"']+["']\s*;?/g;
const require = createRequire(join(process.cwd(), "package.json"));

function rewriteModuleAliases(source: string, path: string): string {
  const sourcePath = path.includes("/src/") ? path.slice(path.indexOf("/src/") + 1) : path;
  return source.replace(/(\b(?:from|import)\s*(?:\(\s*)?["'])@\/([^"']+)(["'])/g, (_match, prefix, aliasPath, quote) => {
    const relativePath = posix.relative(posix.dirname(sourcePath), `src/${aliasPath}`);
    return `${prefix}${relativePath.startsWith(".") ? relativePath : `./${relativePath}`}${quote}`;
  });
}

export function transformPreviewModule(source: string, path: string): string {
  const resolvedSource = rewriteModuleAliases(source, path);
  const styles = [...resolvedSource.matchAll(cssImport)].map((match) => match[1]);
  const assets = [...resolvedSource.matchAll(assetImport)].map((match) => ({ name: match[1], path: match[2] }));
  const withoutStyles = resolvedSource.replace(cssImport, "").replace(assetImport, "");
  const loader = path.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve;
  const transformed = ts.transpileModule(withoutStyles, { compilerOptions: { jsx: loader, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const styleLoader = styles.map((style, index) => `const previewStyle${index} = document.createElement("link"); previewStyle${index}.rel = "stylesheet"; previewStyle${index}.href = new URL(${JSON.stringify(`${style}?preview=${previewAssetVersion}`)}, import.meta.url).href; document.head.append(previewStyle${index});`).join("\n");
  const assetLoader = assets.map(({ name, path: assetPath }) => `const ${name} = new URL(${JSON.stringify(assetPath)}, import.meta.url).href;`).join("\n");
  return `${styleLoader}\n${assetLoader}\n${transformed}`;
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
  const compiler = await compile(source.replace(tailwindPlugin, ""), { loadStylesheet: async (id) => ({ path: id, base: "", content: id === "tailwindcss" ? tailwindStylesheet : "" }) });
  return compiler.build(candidates);
}
