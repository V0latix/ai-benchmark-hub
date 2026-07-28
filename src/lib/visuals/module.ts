import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, posix } from "node:path";

import { compile } from "tailwindcss";
import ts from "typescript";

import { getPreviewVendorUrl, previewAssetVersion, withPreviewQuery } from "./preview";

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

function rewriteLocalModuleSpecifiers(source: string, query?: string): string {
  if (!query) return source;
  return source.replace(/(\b(?:from|import)\s*(?:\(\s*)?)(["'])((?:\.{1,2}\/)[^"']+)\2/g, (_match, prefix, quote, specifier) => `${prefix}${quote}${withPreviewQuery(specifier, query)}${quote}`);
}

type PreviewModuleVendorContext = {
  assetBaseUrl: string;
  dependencies: Record<string, string>;
};

export type PreviewStylesheetContext = {
  query?: string;
  assetBaseUrl?: string;
};

function rewriteBareModuleSpecifiers(source: string, query: string | undefined, vendor?: PreviewModuleVendorContext): string {
  if (!query || !vendor) return source;
  return source.replace(/(\b(?:from|import)\s*(?:\(\s*)?)(["'])([^"']+)\2/g, (match, prefix, quote, specifier: string) => {
    if (specifier.startsWith(".") || specifier.startsWith("/") || /^[a-z]+:/i.test(specifier)) return match;
    const dependency = Object.keys(vendor.dependencies)
      .sort((left, right) => right.length - left.length)
      .find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (!dependency) return match;
    const subpath = specifier.slice(dependency.length);
    const target = getPreviewVendorUrl(vendor.assetBaseUrl, `${dependency}@${vendor.dependencies[dependency]}${subpath}`);
    return `${prefix}${quote}${withPreviewQuery(target, query)}${quote}`;
  });
}

export function transformPreviewModule(source: string, path: string, query?: string, vendor?: PreviewModuleVendorContext): string {
  const resolvedSource = rewriteModuleAliases(source, path);
  const styles = [...resolvedSource.matchAll(cssImport)].map((match) => match[1]);
  const assets = [...resolvedSource.matchAll(assetImport)].map((match) => ({ name: match[1], path: match[2] }));
  const withoutStyles = resolvedSource.replace(cssImport, "").replace(assetImport, "");
  const loader = path.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve;
  const transformed = rewriteBareModuleSpecifiers(rewriteLocalModuleSpecifiers(ts.transpileModule(withoutStyles, { compilerOptions: { jsx: loader, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, query), query, vendor);
  const styleLoader = styles.map((style, index) => `const previewStyle${index} = document.createElement("link"); previewStyle${index}.rel = "stylesheet"; previewStyle${index}.href = new URL(${JSON.stringify(withPreviewQuery(`${style}?preview=${previewAssetVersion}`, query))}, import.meta.url).href; document.head.append(previewStyle${index});`).join("\n");
  const assetLoader = assets.map(({ name, path: assetPath }) => `const ${name} = new URL(${JSON.stringify(withPreviewQuery(assetPath, query))}, import.meta.url).href;`).join("\n");
  return `${styleLoader}\n${assetLoader}\n${transformed}`;
}

function rewriteStylesheetReference(reference: string, context: PreviewStylesheetContext): string {
  if (!context.query || reference.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(reference)) return reference;
  if (reference.startsWith("/") && context.assetBaseUrl) return withPreviewQuery(`${context.assetBaseUrl.replace(/\/$/, "")}${reference}`, context.query);
  if (reference.startsWith("./") || reference.startsWith("../")) return withPreviewQuery(reference, context.query);
  return reference;
}

export function transformPreviewStylesheet(source: string, context: PreviewStylesheetContext = {}): string {
  const withoutTailwind = source.replace(/@import\s+["']tailwindcss["'];?\s*/g, "");
  return withoutTailwind
    .replace(/(@import\s+)(["'])([^"']+)\2/g, (_match, prefix, quote, url) => `${prefix}${quote}${rewriteStylesheetReference(url, context)}${quote}`)
    .replace(/(url\(\s*)(["']?)([^"')]+)\2(\s*\))/g, (_match, prefix, quote, url, suffix) => `${prefix}${quote}${rewriteStylesheetReference(url, context)}${quote}${suffix}`);
}

export function extractTailwindCandidates(source: string): string[] {
  const candidates = new Set<string>();
  for (const match of source.matchAll(/["'`]([^"'`]{1,240})["'`]/g)) for (const token of match[1].split(/\s+/)) if (/^[!\w:[\]/.%#()-]+$/i.test(token)) candidates.add(token);
  return [...candidates];
}

export async function compilePreviewStylesheet(source: string, candidates: string[], context?: PreviewStylesheetContext): Promise<string> {
  const tailwindStylesheet = await readFile(require.resolve("tailwindcss/index.css"), "utf8");
  const compiler = await compile(source.replace(tailwindPlugin, ""), { loadStylesheet: async (id) => ({ path: id, base: "", content: id === "tailwindcss" ? tailwindStylesheet : "" }) });
  return transformPreviewStylesheet(compiler.build(candidates), context);
}
