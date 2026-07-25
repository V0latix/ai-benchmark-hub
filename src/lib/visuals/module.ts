import ts from "typescript";

const cssImport = /import\s+["']([^"']+\.css)["'];?/g;

export function transformPreviewModule(source: string, path: string): string {
  const styles = [...source.matchAll(cssImport)].map((match) => match[1]);
  const withoutStyles = source.replace(cssImport, "");
  const loader = path.endsWith(".tsx") ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve;
  const transformed = ts.transpileModule(withoutStyles, { compilerOptions: { jsx: loader, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const styleLoader = styles.map((style, index) => `const previewStyle${index} = document.createElement("link"); previewStyle${index}.rel = "stylesheet"; previewStyle${index}.href = new URL(${JSON.stringify(style)}, import.meta.url).href; document.head.append(previewStyle${index});`).join("\n");
  return `${styleLoader}\n${transformed}`;
}
