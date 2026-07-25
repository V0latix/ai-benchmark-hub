function rawDirectoryUrl(repo: string, branch: string, filePath: string): string {
  const directory = filePath.split("/").slice(0, -1).map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${directory}/`;
}

export function getPreviewProxyUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual?interactive=1`;
}

export const interactivePreviewSandbox = "allow-scripts";
export const interactivePreviewCsp = "default-src 'none'; script-src 'self' http: https: 'unsafe-inline'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; font-src http: https: data:; connect-src http: https:; object-src 'none'; frame-ancestors 'self'; form-action 'none'";
export const interactivePreviewCorsHeaders = { "Access-Control-Allow-Origin": "*" };

export function getPreviewAssetUrl(runId: string, path: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual/asset/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function getPreviewAssetBase(repo: string, branch: string, filePath: string): string {
  return rawDirectoryUrl(repo, branch, filePath);
}

export function injectPreviewBase(html: string, baseUrl: string): string {
  const base = `<base href="${baseUrl}">`;
  return /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`) : `${base}${html}`;
}

export function injectInteractivePreview(html: string, assetBaseUrl: string, dependencies: Record<string, string>): string {
  const imports = Object.fromEntries(Object.entries(dependencies).flatMap(([name, version]) => [[name, `https://esm.sh/${name}@${version}`], [`${name}/`, `https://esm.sh/${name}@${version}/`]]));
  const entry = `${assetBaseUrl}/src/main.tsx`;
  const withoutViteEntry = html.replace(/<script\b[^>]*\bsrc=["']\/src\/[^"']+["'][^>]*><\/script>/i, "");
  const rewrittenRoots = withoutViteEntry.replace(/\b(src|href)=["']\/(?!\/)/gi, `$1="${assetBaseUrl}/`);
  const storageShim = `<script>window.addEventListener("error", (event) => { document.documentElement.dataset.previewError = event.message; }); window.addEventListener("unhandledrejection", (event) => { document.documentElement.dataset.previewError = String(event.reason); }); document.documentElement.dataset.previewBootstrap = "ready"; const previewStorage = new Map(); const previewStorageApi = { getItem: (key) => previewStorage.get(String(key)) ?? null, setItem: (key, value) => previewStorage.set(String(key), String(value)), removeItem: (key) => previewStorage.delete(String(key)), clear: () => previewStorage.clear(), key: (index) => Array.from(previewStorage.keys())[index] ?? null, get length() { return previewStorage.size; } }; try { Object.defineProperty(globalThis, "localStorage", { value: previewStorageApi }); } catch {}</script>`;
  const moduleLoader = `<script>const previewEntry = document.createElement("script"); previewEntry.type = "module"; previewEntry.src = ${JSON.stringify(entry)}; previewEntry.onerror = () => { document.documentElement.dataset.previewError = "Entry module failed to load"; }; document.body.append(previewEntry);</script>`;
  const bootstrap = `${storageShim}<script type="importmap">${JSON.stringify({ imports })}</script>${moduleLoader}`;
  return /<\/body>/i.test(rewrittenRoots) ? rewrittenRoots.replace(/<\/body>/i, `${bootstrap}</body>`) : `${rewrittenRoots}${bootstrap}`;
}
