function rawDirectoryUrl(repo: string, branch: string, filePath: string): string {
  const directory = filePath.split("/").slice(0, -1).map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${directory}/`;
}

export function getPreviewProxyUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual?interactive=2`;
}

export const previewAssetVersion = "tailwind-2";
export const interactivePreviewSandbox = "allow-scripts";
export const interactivePreviewCsp = "default-src 'none'; script-src 'self' http: https: 'unsafe-inline'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; font-src http: https: data:; connect-src http: https:; object-src 'none'; frame-ancestors 'self'; form-action 'none'";
export const interactivePreviewCorsHeaders = { "Access-Control-Allow-Origin": "*" };

export function getPreviewAssetBaseUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual/asset`;
}

export function getPreviewVendorUrl(assetBaseUrl: string, modulePath: string): string {
  const vendorBaseUrl = assetBaseUrl.replace(/\/asset$/, "/vendor");
  return `${vendorBaseUrl}/${modulePath.split("/").map((segment) => encodeURIComponent(segment).replace(/%40/gi, "@")).join("/")}`;
}

export function withPreviewQuery(url: string, query?: string): string {
  if (!query) return url;
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const current = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");
  const supplied = new URLSearchParams(query);
  for (const key of new Set(supplied.keys())) {
    current.delete(key);
    for (const value of supplied.getAll(key)) current.append(key, value);
  }
  const encoded = current.toString();
  return `${path}${encoded ? `?${encoded}` : ""}${hash}`;
}

export function getPreviewAssetUrl(runId: string, path: string): string {
  return `${getPreviewAssetBaseUrl(runId)}/${path.split("/").map(encodeURIComponent).join("/")}?preview=${previewAssetVersion}`;
}

export function getPreviewAssetBase(repo: string, branch: string, filePath: string): string {
  return rawDirectoryUrl(repo, branch, filePath);
}

export function injectPreviewBase(html: string, baseUrl: string): string {
  const base = `<base href="${baseUrl}">`;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`) : `${base}${html}`;
}

function injectPreviewBootstrap(html: string, bootstrap: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bootstrap}</body>`) : `${html}${bootstrap}`;
}

function rewritePreviewRootUrls(html: string, assetBaseUrl: string, query?: string): string {
  return html.replace(/\b(src|href)=(["'])\/(?!\/)([^"']*)\2/gi, (_match, attribute, _quote, path) => `${attribute}="${withPreviewQuery(`${assetBaseUrl}/${path}`, query)}"`);
}

function previewStorageShim(): string {
  return `<script>window.addEventListener("error", (event) => { document.documentElement.dataset.previewError = event.message; }); window.addEventListener("unhandledrejection", (event) => { document.documentElement.dataset.previewError = String(event.reason); }); document.documentElement.dataset.previewBootstrap = "ready"; const previewStorage = new Map(); const previewStorageApi = { getItem: (key) => previewStorage.get(String(key)) ?? null, setItem: (key, value) => previewStorage.set(String(key), String(value)), removeItem: (key) => previewStorage.delete(String(key)), clear: () => previewStorage.clear(), key: (index) => Array.from(previewStorage.keys())[index] ?? null, get length() { return previewStorage.size; } }; try { Object.defineProperty(globalThis, "localStorage", { value: previewStorageApi }); } catch {}</script>`;
}

export function injectInteractivePreview(html: string, assetBaseUrl: string, dependencies: Record<string, string>, query?: string): string {
  const imports = Object.fromEntries(Object.entries(dependencies).flatMap(([name, version]) => {
    const packagePath = `${name}@${version}`;
    return [[name, withPreviewQuery(getPreviewVendorUrl(assetBaseUrl, packagePath), query)], [`${name}/`, withPreviewQuery(`${getPreviewVendorUrl(assetBaseUrl, packagePath)}/`, query)]];
  }));
  const entry = withPreviewQuery(`${assetBaseUrl}/src/main.tsx?preview=${previewAssetVersion}`, query);
  const withoutViteEntry = html.replace(/<script\b[^>]*\bsrc=["']\/src\/[^"']+["'][^>]*><\/script>/i, "");
  const rewrittenRoots = rewritePreviewRootUrls(withoutViteEntry, assetBaseUrl, query);
  const moduleLoader = `<script>const previewEntry = document.createElement("script"); previewEntry.type = "module"; previewEntry.src = ${JSON.stringify(entry)}; previewEntry.onerror = () => { document.documentElement.dataset.previewError = "Entry module failed to load"; }; document.body.append(previewEntry);</script>`;
  return injectPreviewBootstrap(rewrittenRoots, `${previewStorageShim()}<script type="importmap">${JSON.stringify({ imports })}</script>${moduleLoader}`);
}

export function injectStandalonePreview(html: string, assetBaseUrl: string, query?: string): string {
  return injectPreviewBootstrap(rewritePreviewRootUrls(html, assetBaseUrl, query), previewStorageShim());
}
