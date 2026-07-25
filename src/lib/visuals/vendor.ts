function encodePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment).replace(/%40/gi, "@")).join("/");
}

function vendorSpecifier(specifier: string, vendorBaseUrl: string): string {
  const upstream = specifier.replace(/^https:\/\/esm\.sh\//, "").replace(/^\//, "");
  const [path, query] = upstream.split("?", 2);
  return `${vendorBaseUrl}/${encodePath(path)}${query ? `?upstream=${encodeURIComponent(query)}` : ""}`;
}

export function rewriteEsmModuleImports(source: string, vendorBaseUrl: string): string {
  const staticImport = /\b(import|export)\s+((?:[^"']*?\s+from\s+)?)(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\3/g;
  const dynamicImport = /\bimport\(\s*(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\1\s*\)/g;
  return source
    .replace(staticImport, (_match, statement, clause, quote, specifier) => `${statement} ${clause}${quote}${vendorSpecifier(specifier, vendorBaseUrl)}${quote}`)
    .replace(dynamicImport, (_match, quote, specifier) => `import(${quote}${vendorSpecifier(specifier, vendorBaseUrl)}${quote})`);
}

export function isSafeEsmModulePath(path: string): boolean {
  return Boolean(path) && !path.includes("..") && /^[a-zA-Z0-9@._~^*<>=|/-]+$/.test(path);
}

export function isSafeEsmQuery(query: string): boolean {
  return !query || /^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(query);
}
