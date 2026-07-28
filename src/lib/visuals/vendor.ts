function encodePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment).replace(/%40/gi, "@")).join("/");
}

type RuntimeVersions = Partial<Record<"react" | "react-dom", string>>;

export function getEsmPackageVersion(source: string, packageName: "react" | "react-dom"): string | undefined {
  const escapedName = packageName.replace("-", "\\-");
  return source.match(new RegExp(`/\\*\\s*esm\\.sh\\s*\\-\\s*${escapedName}@([^\\s*]+)\\s*\\*/`))?.[1];
}

function pinReactRuntime(path: string, runtimeVersions: RuntimeVersions): string {
  const match = path.match(/^(react(?:-dom)?)(?:@[^/]+)?(\/.*)?$/);
  if (!match || !runtimeVersions[match[1] as keyof RuntimeVersions]) return path;
  return `${match[1]}@${runtimeVersions[match[1] as keyof RuntimeVersions]}${match[2] ?? ""}`;
}

function vendorSpecifier(specifier: string, vendorBaseUrl: string, runtimeVersions: RuntimeVersions, previewQuery?: string): string {
  const upstream = specifier.replace(/^https:\/\/esm\.sh\//, "").replace(/^\//, "");
  const [path, upstreamQuery] = upstream.split("?", 2);
  const decodedPath = pinReactRuntime(decodeURIComponent(path), runtimeVersions);
  return withPreviewQuery(`${vendorBaseUrl}/${encodePath(decodedPath)}${upstreamQuery ? `?upstream=${encodeURIComponent(upstreamQuery)}` : ""}`, previewQuery);
}

export function rewriteEsmModuleImports(source: string, vendorBaseUrl: string, runtimeVersions: RuntimeVersions = {}, previewQuery?: string): string {
  const staticImport = /\b((?:import|export)(?:[^;"']*?\bfrom)?\s*)(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\2/g;
  const dynamicImport = /\bimport\(\s*(["'])(\/(?!\/)[^"']+|https:\/\/esm\.sh\/[^"']+)\1\s*\)/g;
  return source
    .replace(staticImport, (_match, prefix, quote, specifier) => `${prefix}${quote}${vendorSpecifier(specifier, vendorBaseUrl, runtimeVersions, previewQuery)}${quote}`)
    .replace(dynamicImport, (_match, quote, specifier) => `import(${quote}${vendorSpecifier(specifier, vendorBaseUrl, runtimeVersions, previewQuery)}${quote})`);
}

export function isSafeEsmModulePath(path: string): boolean {
  return Boolean(path) && !path.includes("..") && /^[a-zA-Z0-9 @._~^*<>=|/-]+$/.test(path);
}

export function isSafeEsmQuery(query: string): boolean {
  return !query || /^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(query);
}
import { withPreviewQuery } from "./preview";
