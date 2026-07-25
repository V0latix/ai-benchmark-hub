function encodePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment).replace(/%40/gi, "@")).join("/");
}

function vendorSpecifier(specifier: string, vendorBaseUrl: string): string {
  const upstream = specifier.replace(/^https:\/\/esm\.sh\//, "").replace(/^\//, "");
  const [path, query] = upstream.split("?", 2);
  const decodedPath = decodeURIComponent(path);
  return `${vendorBaseUrl}/${encodePath(decodedPath)}${query ? `?upstream=${encodeURIComponent(query)}` : ""}`;
}

export function rewriteEsmModuleImports(source: string, vendorBaseUrl: string): string {
  const staticImport = /\b((?:import|export)(?:[^;"']*?\bfrom)?\s*)(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\2/g;
  const dynamicImport = /\bimport\(\s*(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\1\s*\)/g;
  return source
    .replace(staticImport, (_match, prefix, quote, specifier) => `${prefix}${quote}${vendorSpecifier(specifier, vendorBaseUrl)}${quote}`)
    .replace(dynamicImport, (_match, quote, specifier) => `import(${quote}${vendorSpecifier(specifier, vendorBaseUrl)}${quote})`);
}

export function isSafeEsmModulePath(path: string): boolean {
  return Boolean(path) && !path.includes("..") && /^[a-zA-Z0-9 @._~^*<>=|/-]+$/.test(path);
}

export function isSafeEsmQuery(query: string): boolean {
  return !query || /^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(query);
}
