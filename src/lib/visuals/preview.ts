import { decodeHTMLAttribute } from "entities";

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
export const adminPreviewInitMessageType = "benchmark-admin-preview-init";
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

type HtmlAttribute = {
  name: string;
  quote: "\"" | "'" | null;
  range: [number, number];
  value: string | null;
  valueRange?: [number, number];
};

type HtmlTag = {
  attributes: HtmlAttribute[];
  close: number;
  name: string;
};

const isHtmlSpace = (value: string) => value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f";

function findHtmlTagEnd(html: string, start: number): number {
  let quote = "";
  for (let index = start; index < html.length; index += 1) {
    const value = html[index] ?? "";
    if (quote) {
      if (value === quote) quote = "";
    } else if (value === "\"" || value === "'") quote = value;
    else if (value === ">") return index + 1;
  }
  return -1;
}

function parseHtmlTag(tag: string): HtmlTag | null {
  if (tag[0] !== "<" || tag[1] === "/" || tag.at(-1) !== ">") return null;
  let cursor = 1;
  while (cursor < tag.length && !isHtmlSpace(tag[cursor] ?? "") && !"/>".includes(tag[cursor] ?? "")) cursor += 1;
  if (cursor === 1) return null;
  const parsed: HtmlTag = { attributes: [], close: tag.length - 1, name: tag.slice(1, cursor).toLowerCase() };

  while (cursor < tag.length - 1) {
    const rangeStart = cursor;
    while (isHtmlSpace(tag[cursor] ?? "")) cursor += 1;
    if ("/>".includes(tag[cursor] ?? "")) {
      parsed.close = rangeStart;
      break;
    }
    const nameStart = cursor;
    while (cursor < tag.length - 1 && !isHtmlSpace(tag[cursor] ?? "") && !"=/>".includes(tag[cursor] ?? "")) cursor += 1;
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }
    const attribute: HtmlAttribute = {
      name: tag.slice(nameStart, cursor).toLowerCase(),
      quote: null,
      range: [rangeStart, cursor],
      value: null
    };
    while (isHtmlSpace(tag[cursor] ?? "")) cursor += 1;
    if (tag[cursor] === "=") {
      cursor += 1;
      while (isHtmlSpace(tag[cursor] ?? "")) cursor += 1;
      const quote: HtmlAttribute["quote"] = tag[cursor] === "\""
        ? "\""
        : tag[cursor] === "'"
          ? "'"
          : null;
      if (quote) cursor += 1;
      const valueStart = cursor;
      while (
        cursor < tag.length - 1
        && (quote ? tag[cursor] !== quote : !isHtmlSpace(tag[cursor] ?? "") && tag[cursor] !== ">")
      ) cursor += 1;
      attribute.quote = quote;
      attribute.value = tag.slice(valueStart, cursor);
      attribute.valueRange = [valueStart, cursor];
      if (quote && tag[cursor] === quote) cursor += 1;
    }
    attribute.range[1] = cursor;
    parsed.attributes.push(attribute);
  }
  return parsed;
}

function findRawTextEnd(html: string, lower: string, name: string, start: number): number {
  const needle = `</${name}`;
  let candidate = lower.indexOf(needle, start);
  while (candidate >= 0) {
    const boundary = html[candidate + needle.length] ?? "";
    if (boundary === ">" || boundary === "/" || isHtmlSpace(boundary)) {
      const end = html.indexOf(">", candidate + needle.length);
      return end < 0 ? html.length : end + 1;
    }
    candidate = lower.indexOf(needle, candidate + needle.length);
  }
  return html.length;
}

function transformHtmlTags(html: string, transform: (source: string, tag: HtmlTag) => string): string {
  const lower = html.toLowerCase();
  let copied = 0;
  let cursor = 0;
  const output: string[] = [];
  while (cursor < html.length) {
    const opening = html.indexOf("<", cursor);
    if (opening < 0) break;
    if (html.startsWith("<!--", opening)) {
      const end = html.indexOf("-->", opening + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    const first = html[opening + 1] ?? "";
    if (!/[A-Za-z]/.test(first)) {
      if ("!/?".includes(first)) {
        const end = findHtmlTagEnd(html, opening + 1);
        cursor = end < 0 ? html.length : end;
      } else cursor = opening + 1;
      continue;
    }
    const end = findHtmlTagEnd(html, opening + 1);
    if (end < 0) break;
    const source = html.slice(opening, end);
    const tag = parseHtmlTag(source);
    if (!tag) {
      cursor = end;
      continue;
    }
    const replacement = transform(source, tag);
    if (replacement !== source) {
      output.push(html.slice(copied, opening), replacement);
      copied = end;
    }
    cursor = ["script", "style", "textarea", "title"].includes(tag.name)
      ? findRawTextEnd(html, lower, tag.name, end)
      : end;
  }
  output.push(html.slice(copied));
  return output.join("");
}

function rewritePreviewReference(reference: string, assetBaseUrl: string, query?: string): string | null {
  if (
    !reference
    || reference.startsWith("#")
    || reference.startsWith("?")
    || reference.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(reference)
  ) {
    return null;
  }

  const hashIndex = reference.indexOf("#");
  const hash = hashIndex >= 0 ? reference.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? reference.slice(0, hashIndex) : reference;
  const queryIndex = withoutHash.indexOf("?");
  const suffix = `${queryIndex >= 0 ? withoutHash.slice(queryIndex) : ""}${hash}`;
  let path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  if (path.includes("\\")) throw new Error("Preview relative URL escapes artifact root");
  path = path.replace(/^\/+/, "").replace(/^(?:\.\/)+/, "");
  if (!path) return null;
  const unsafe = path.split("/").some((segment) => {
    try {
      return decodeURIComponent(segment) === "..";
    } catch {
      return true;
    }
  });
  if (unsafe) throw new Error("Preview relative URL escapes artifact root");
  return withPreviewQuery(`${assetBaseUrl.replace(/\/$/, "")}/${path}${suffix}`, query);
}

function replaceHtmlRanges(source: string, replacements: Array<{ range: [number, number]; value: string }>): string {
  if (!replacements.length) return source;
  const output: string[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    output.push(source.slice(cursor, replacement.range[0]), replacement.value);
    cursor = replacement.range[1];
  }
  output.push(source.slice(cursor));
  return output.join("");
}

function serializeHtmlAttribute(value: string, quote: HtmlAttribute["quote"]): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(quote === "'" ? "'" : "\"", quote === "'" ? "&#39;" : "&quot;");
  return quote === null ? `"${escaped}"` : escaped;
}

function rewritePreviewHtmlUrls(html: string, assetBaseUrl: string, query?: string): string {
  return transformHtmlTags(html, (source, tag) => {
    const replacements = tag.attributes.flatMap((attribute) => {
      if (
        (attribute.name !== "src" && attribute.name !== "href")
        || attribute.value === null
        || attribute.valueRange === undefined
      ) return [];
      const rewritten = rewritePreviewReference(decodeHTMLAttribute(attribute.value), assetBaseUrl, query);
      return rewritten === null
        ? []
        : [{ range: attribute.valueRange, value: serializeHtmlAttribute(rewritten, attribute.quote) }];
    });
    return replaceHtmlRanges(source, replacements);
  });
}

const readHtmlAttribute = (tag: HtmlTag, name: string) => tag.attributes.find((attribute) => attribute.name === name);

function withCredentialedCrossOrigin(source: string, tag: HtmlTag, before?: "src" | "href"): string {
  const removals = tag.attributes
    .filter((attribute) => attribute.name === "crossorigin")
    .map((attribute) => ({ range: attribute.range, value: "" }));
  const withoutCrossOrigin = replaceHtmlRanges(source, removals);
  const reparsed = parseHtmlTag(withoutCrossOrigin);
  if (!reparsed) return source;
  const insertion = (before ? readHtmlAttribute(reparsed, before)?.range[0] : undefined) ?? reparsed.close;
  return `${withoutCrossOrigin.slice(0, insertion)} crossorigin="use-credentials"${withoutCrossOrigin.slice(insertion)}`;
}

function credentialStandalonePreviewResources(html: string, assetBaseUrl: string): string {
  const assetBase = assetBaseUrl.replace(/\/$/, "");
  return transformHtmlTags(html, (source, tag) => {
    if (tag.name === "script") {
      const type = readHtmlAttribute(tag, "type")?.value;
      return type?.toLowerCase() === "module"
        ? withCredentialedCrossOrigin(
            source,
            tag,
            readHtmlAttribute(tag, "src") === undefined ? undefined : "src"
          )
        : source;
    }
    if (tag.name !== "link") return source;
    const rel = readHtmlAttribute(tag, "rel")?.value?.toLowerCase().split(/\s+/) ?? [];
    const href = readHtmlAttribute(tag, "href")?.value;
    const needsCredentials = rel.includes("modulepreload")
      || (rel.includes("stylesheet") && href != null && href.startsWith(`${assetBase}/`));
    return needsCredentials ? withCredentialedCrossOrigin(source, tag, "href") : source;
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
  const initMessageType = JSON.stringify(adminPreviewInitMessageType);
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
      generation: null,
      post(nextState) {
        if (!Number.isSafeInteger(this.generation) || this.generation <= 0) return;
        parent.postMessage({ type: ${messageType}, state: nextState, nonce: ${nonce}, generation: this.generation }, "*");
      },
      fail() {
        this.failed = true;
        document.documentElement.dataset.previewError = "true";
        this.post("error");
      },
      maybeReady() {
        if (this.failed || this.readySent || !this.windowLoaded || !this.entryLoaded || this.generation === null) return;
        queueMicrotask(() => {
          if (this.failed || this.readySent || !this.windowLoaded || !this.entryLoaded || this.generation === null) return;
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
    addEventListener("message", (event) => {
      if (event.source !== parent || !event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
      const message = event.data;
      if (
        Object.keys(message).sort().join(",") !== "generation,nonce,type"
        || message.type !== ${initMessageType}
        || message.nonce !== ${nonce}
        || !Number.isSafeInteger(message.generation)
        || message.generation <= 0
      ) return;
      state.generation = message.generation;
      state.readySent = false;
      if (state.failed) state.post("error");
      else state.maybeReady();
    });
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
  const entry = withPreviewQuery(
    `${assetBaseUrl}/src/main.tsx${query === undefined ? `?preview=${previewAssetVersion}` : ""}`,
    query
  );
  const withoutViteEntry = html.replace(/<script\b[^>]*\bsrc=["'](?:\/|\.\/)?src\/[^"']+["'][^>]*><\/script>/i, "");
  let rewritten = rewritePreviewHtmlUrls(withoutViteEntry, assetBaseUrl, query);
  if (readiness) {
    rewritten = injectPreviewHeadBootstrap(rewritten, adminReadinessBootstrap(readiness, true));
  }
  const moduleLoader = readiness
    ? `<script>const previewEntry = document.createElement("script"); previewEntry.type = "module"; previewEntry.crossOrigin = "use-credentials"; previewEntry.src = ${JSON.stringify(entry)}; previewEntry.onload = () => globalThis.__benchmarkAdminPreview.entryReady(); previewEntry.onerror = () => globalThis.__benchmarkAdminPreview.fail(); document.body.append(previewEntry);</script>`
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
    ? injectPreviewHeadBootstrap(
        credentialStandalonePreviewResources(rewritten, assetBaseUrl),
        adminReadinessBootstrap(readiness, false)
      )
    : injectPreviewBootstrap(rewritten, previewStorageShim());
}
