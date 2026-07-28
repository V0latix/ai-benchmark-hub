function rawDirectoryUrl(repo: string, branch: string, filePath: string): string {
  const directory = filePath.split("/").slice(0, -1).map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${directory}/`;
}

export function getPreviewProxyUrl(runId: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/visual?interactive=2`;
}

export const previewAssetVersion = "tailwind-2";
export const interactivePreviewSandbox = "allow-scripts";
export const adminPreviewMessageType = "benchmark-admin-preview";
export const interactivePreviewCsp = "default-src 'none'; script-src 'self' http: https: 'unsafe-inline'; style-src 'self' http: https: 'unsafe-inline'; img-src 'self' http: https: data: blob:; font-src http: https: data:; connect-src http: https:; object-src 'none'; frame-ancestors 'self'; form-action 'none'";
export const adminPreviewCsp = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'";
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

function injectPreviewHeadBootstrap(html: string, bootstrap: string): string {
  return /<head(?:\s[^>]*)?>/i.test(html)
    ? html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${bootstrap}`)
    : `${bootstrap}${html}`;
}

function rewritePreviewHtmlUrls(html: string, assetBaseUrl: string, query?: string): string {
  const base = assetBaseUrl.replace(/\/$/, "");
  return html.replace(/\b(src|href)\s*=\s*(["'])([^"']*)\2/gi, (match, attribute, _quote, reference: string) => {
    if (
      !reference
      || reference.startsWith("#")
      || reference.startsWith("?")
      || reference.startsWith("//")
      || /^[a-z][a-z0-9+.-]*:/i.test(reference)
    ) {
      return match;
    }

    const hashIndex = reference.indexOf("#");
    const hash = hashIndex >= 0 ? reference.slice(hashIndex) : "";
    const withoutHash = hashIndex >= 0 ? reference.slice(0, hashIndex) : reference;
    const queryIndex = withoutHash.indexOf("?");
    const suffix = `${queryIndex >= 0 ? withoutHash.slice(queryIndex) : ""}${hash}`;
    let path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    if (path.includes("\\")) throw new Error("Preview relative URL escapes artifact root");
    path = path.replace(/^\/+/, "").replace(/^(?:\.\/)+/, "");
    if (!path) return match;
    const unsafe = path.split("/").some((segment) => {
      try {
        return decodeURIComponent(segment) === "..";
      } catch {
        return true;
      }
    });
    if (unsafe) throw new Error("Preview relative URL escapes artifact root");
    return `${attribute}="${withPreviewQuery(`${base}/${path}${suffix}`, query)}"`;
  });
}

function previewStorageShim(): string {
  return `<script>window.addEventListener("error", (event) => { document.documentElement.dataset.previewError = event.message; }); window.addEventListener("unhandledrejection", (event) => { document.documentElement.dataset.previewError = String(event.reason); }); document.documentElement.dataset.previewBootstrap = "ready"; const previewStorage = new Map(); const previewStorageApi = { getItem: (key) => previewStorage.get(String(key)) ?? null, setItem: (key, value) => previewStorage.set(String(key), String(value)), removeItem: (key) => previewStorage.delete(String(key)), clear: () => previewStorage.clear(), key: (index) => Array.from(previewStorage.keys())[index] ?? null, get length() { return previewStorage.size; } }; try { Object.defineProperty(globalThis, "localStorage", { value: previewStorageApi }); } catch {}</script>`;
}

type AdminPreviewReadiness = {
  nonce: string;
};

function adminReadinessBootstrap(readiness: AdminPreviewReadiness, waitForEntry: boolean): string {
  const messageType = JSON.stringify(adminPreviewMessageType);
  const nonce = JSON.stringify(readiness.nonce);
  return `<script>(() => {
    const previewStorage = new Map();
    const previewStorageApi = { getItem: (key) => previewStorage.get(String(key)) ?? null, setItem: (key, value) => previewStorage.set(String(key), String(value)), removeItem: (key) => previewStorage.delete(String(key)), clear: () => previewStorage.clear(), key: (index) => Array.from(previewStorage.keys())[index] ?? null, get length() { return previewStorage.size; } };
    try { Object.defineProperty(globalThis, "localStorage", { value: previewStorageApi }); } catch {}
    const state = {
      failed: false,
      windowLoaded: document.readyState === "complete",
      entryLoaded: ${waitForEntry ? "false" : "true"},
      readySent: false,
      post(nextState) {
        parent.postMessage({ type: ${messageType}, state: nextState, nonce: ${nonce} }, "*");
      },
      fail() {
        this.failed = true;
        document.documentElement.dataset.previewError = "true";
        this.post("error");
      },
      maybeReady() {
        if (this.failed || this.readySent || !this.windowLoaded || !this.entryLoaded) return;
        queueMicrotask(() => {
          if (this.failed || this.readySent || !this.windowLoaded || !this.entryLoaded) return;
          this.readySent = true;
          this.post("ready");
        });
      },
      entryReady() {
        this.entryLoaded = true;
        this.maybeReady();
      }
    };
    Object.defineProperty(globalThis, "__benchmarkAdminPreview", { value: state });
    addEventListener("error", () => state.fail(), true);
    addEventListener("unhandledrejection", () => state.fail());
    addEventListener("load", () => { state.windowLoaded = true; state.maybeReady(); }, { once: true });
    document.documentElement.dataset.previewBootstrap = "ready";
    state.maybeReady();
  })();</script>`;
}

export function injectInteractivePreview(
  html: string,
  assetBaseUrl: string,
  dependencies: Record<string, string>,
  query?: string,
  readiness?: AdminPreviewReadiness
): string {
  const imports = Object.fromEntries(Object.entries(dependencies).flatMap(([name, version]) => {
    const packagePath = `${name}@${version}`;
    return [[name, withPreviewQuery(getPreviewVendorUrl(assetBaseUrl, packagePath), query)], [`${name}/`, withPreviewQuery(`${getPreviewVendorUrl(assetBaseUrl, packagePath)}/`, query)]];
  }));
  const entry = withPreviewQuery(`${assetBaseUrl}/src/main.tsx?preview=${previewAssetVersion}`, query);
  const withoutViteEntry = html.replace(/<script\b[^>]*\bsrc=["'](?:\/|\.\/)?src\/[^"']+["'][^>]*><\/script>/i, "");
  let rewritten = rewritePreviewHtmlUrls(withoutViteEntry, assetBaseUrl, query);
  if (readiness) {
    rewritten = injectPreviewHeadBootstrap(rewritten, adminReadinessBootstrap(readiness, true));
  }
  const moduleLoader = readiness
    ? `<script>const previewEntry = document.createElement("script"); previewEntry.type = "module"; previewEntry.src = ${JSON.stringify(entry)}; previewEntry.onload = () => globalThis.__benchmarkAdminPreview.entryReady(); previewEntry.onerror = () => globalThis.__benchmarkAdminPreview.fail(); document.body.append(previewEntry);</script>`
    : `<script>const previewEntry = document.createElement("script"); previewEntry.type = "module"; previewEntry.src = ${JSON.stringify(entry)}; previewEntry.onerror = () => { document.documentElement.dataset.previewError = "Entry module failed to load"; }; document.body.append(previewEntry);</script>`;
  return injectPreviewBootstrap(
    rewritten,
    `${readiness ? "" : previewStorageShim()}<script type="importmap">${JSON.stringify({ imports })}</script>${moduleLoader}`
  );
}

export function injectStandalonePreview(
  html: string,
  assetBaseUrl: string,
  query?: string,
  readiness?: AdminPreviewReadiness
): string {
  const rewritten = rewritePreviewHtmlUrls(html, assetBaseUrl, query);
  return readiness
    ? injectPreviewHeadBootstrap(rewritten, adminReadinessBootstrap(readiness, false))
    : injectPreviewBootstrap(rewritten, previewStorageShim());
}
