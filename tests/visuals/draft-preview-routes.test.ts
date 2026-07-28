import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getDraftVisual } from "../../src/app/api/admin/imports/[draftId]/visual/route";
import { GET as getDraftAsset } from "../../src/app/api/admin/imports/[draftId]/visual/asset/[...path]/route";
import { GET as getDraftVendor } from "../../src/app/api/admin/imports/[draftId]/visual/vendor/[...path]/route";
import { signDraftToken } from "../../src/lib/imports/receipts";

const draftId = "4f3a2d1c4b5e6f708192a3b4c5d6e7f8";
const commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const secret = "preview-test-secret";

function queryCount(url: string, name: string): number {
  return new URL(url, "https://hub.example").searchParams.getAll(name).length;
}

function upstreamResponse(url: string, body: string): Response {
  const response = new Response(body);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function draftAssetPath(url: URL): string[] {
  return url.pathname.split("/visual/asset/")[1].split("/").map(decodeURIComponent);
}

function draftVendorPath(url: URL): string[] {
  return url.pathname.split("/visual/vendor/")[1].split("/").map(decodeURIComponent);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("draft preview route graph", () => {
  it("preserves one signed capability through HTML, modules, styles, assets, and pinned vendors", async () => {
    vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt$unused$unused");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    vi.stubEnv("BENCHMARK_GITHUB_TOKEN", "unused-test-token");

    const files = new Map([
      ["index.html", '<html><body><img src="/hero.png"><script type="module" src="/src/main.tsx"></script></body></html>'],
      ["package.json", JSON.stringify({ dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" } })],
      ["src/main.tsx", 'import Widget from "./Widget"; import "./style.css"; import { createRoot } from "react-dom/client"; createRoot(document.createElement("div")); export default Widget;'],
      ["src/Widget.tsx", "export default function Widget(){ return null }"],
      ["src/style.css", '.hero{background-image:url("./hero.png");mask-image:url("/root.png?theme=dark#mask");cursor:url("//attacker.example/steal.png?x=1#cursor")} @import "./theme.css"; @import "/root.css?theme=dark#sheet"; @import "//attacker.example/steal.css?x=1#sheet"; @import "https://attacker.example/absolute.css?x=1#sheet";'],
      ["src/theme.css", ".theme { color: red; }"],
      ["src/hero.png", "png"],
      ["public/hero.png", "png"],
      ["public/root.png", "png"],
      ["public/root.css", ".root { color: blue; }"]
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://raw.githubusercontent.com/")) {
        const marker = `/Melvynx/benchmarks/${commitSha}/benchmarks/gmail-clone/2026-07-26-lmarena-model-a/`;
        const path = decodeURIComponent(url.slice(url.indexOf(marker) + marker.length));
        const value = files.get(path);
        return value === undefined ? new Response("missing", { status: 404 }) : new Response(value);
      }
      if (url === "https://esm.sh/react@^19.2.0?target=es2022") return upstreamResponse(url, "/* esm.sh - react@19.2.8 */\nexport {}");
      if (url === "https://esm.sh/react-dom@^19.2.0?target=es2022") return upstreamResponse(url, "/* esm.sh - react-dom@19.2.8 */\nexport {}");
      if (url.startsWith("https://esm.sh/react-dom@")) return upstreamResponse(url, 'export * from "/react@^18.0.0 || ^19.0.0/es2022/react.mjs";');
      if (url.startsWith("https://esm.sh/react@19.2.8/")) return upstreamResponse(url, "export {};");
      return new Response("missing", { status: 404 });
    }));

    const draftToken = signDraftToken({
      version: 1, draftId, branch: `imports/1785072000-${draftId}`, commitSha,
      task: "gmail-clone", appSlug: "2026-07-26-lmarena-model-a",
      runId: "20260726T120000Z-model-a-lmarena", expiresAt: Date.now() + 60_000
    }, secret);
    const visual = await getDraftVisual(new Request(`https://hub.example/api/admin/imports/${draftId}/visual?token=${encodeURIComponent(draftToken)}`), { params: Promise.resolve({ draftId }) });
    expect(visual.status).toBe(200);
    const html = await visual.text();
    const entryUrl = JSON.parse(html.match(/previewEntry\.src = ("[^"]+")/)![1]) as string;
    const capability = new URL(entryUrl, "https://hub.example").searchParams.get("preview")!;
    expect(queryCount(entryUrl, "preview")).toBe(1);
    expect(new URL(entryUrl, "https://hub.example").searchParams.get("v")).toBe("tailwind-2");
    const rootAsset = html.match(/src="([^"]+hero\.png[^"]*)"/)![1];
    expect(new URL(rootAsset, "https://hub.example").searchParams.getAll("preview")).toEqual([capability]);
    const rootAssetUrl = new URL(rootAsset, "https://hub.example");
    expect((await getDraftAsset(new Request(rootAssetUrl), { params: Promise.resolve({ draftId, path: draftAssetPath(rootAssetUrl) }) })).status).toBe(200);

    const entry = await getDraftAsset(new Request(new URL(entryUrl, "https://hub.example")), { params: Promise.resolve({ draftId, path: ["src", "main.tsx"] }) });
    expect(entry.status).toBe(200);
    const moduleBody = await entry.text();
    const widgetSpecifier = moduleBody.match(/from\s+[\"']([^\"']+Widget[^\"']*)[\"']/)![1];
    const styleSpecifier = JSON.parse(moduleBody.match(/new URL\(("[^"]+style\.css[^"]*")/)![1]) as string;
    for (const specifier of [widgetSpecifier, styleSpecifier]) expect(new URL(specifier, new URL(entryUrl, "https://hub.example")).searchParams.getAll("preview")).toEqual([capability]);
    const vendorUrl = moduleBody.match(/from\s+[\"']([^\"']+\/vendor\/react-dom[^\"']*)[\"']/)![1];
    expect(queryCount(vendorUrl, "preview")).toBe(1);
    const widgetUrl = new URL(widgetSpecifier, new URL(entryUrl, "https://hub.example"));
    const widget = await getDraftAsset(new Request(widgetUrl), { params: Promise.resolve({ draftId, path: draftAssetPath(widgetUrl) }) });
    expect(widget.status).toBe(200);
    const styleUrl = new URL(styleSpecifier, new URL(entryUrl, "https://hub.example"));
    const style = await getDraftAsset(new Request(styleUrl), { params: Promise.resolve({ draftId, path: draftAssetPath(styleUrl) }) });
    expect(style.status).toBe(200);
    const styleBody = await style.text();
    const stylesheetUrls = [...styleBody.matchAll(/(?:url\(\s*|@import\s+)[\"']([^\"']+)/g)].map((match) => match[1]);
    const relativeAndRootUrls = stylesheetUrls.filter((url) => !url.startsWith("//") && !/^[a-z]+:/i.test(url));
    expect(relativeAndRootUrls).toHaveLength(4);
    for (const rewritten of relativeAndRootUrls) {
      const stylesheetUrl = new URL(rewritten, styleUrl);
      expect(stylesheetUrl.searchParams.getAll("preview")).toEqual([capability]);
      if (rewritten.startsWith("/")) expect(stylesheetUrl.pathname).toMatch(new RegExp(`/api/admin/imports/${draftId}/visual/asset/`));
      expect((await getDraftAsset(new Request(stylesheetUrl), { params: Promise.resolve({ draftId, path: draftAssetPath(stylesheetUrl) }) })).status).toBe(200);
    }
    for (const external of stylesheetUrls.filter((url) => url.startsWith("//") || /^[a-z]+:/i.test(url))) expect(new URL(external, styleUrl).searchParams.get("preview")).toBeNull();

    const vendorUrlObject = new URL(vendorUrl, "https://hub.example");
    const vendor = await getDraftVendor(new Request(vendorUrlObject), { params: Promise.resolve({ draftId, path: draftVendorPath(vendorUrlObject) }) });
    expect(vendor.status).toBe(200);
    const vendorBody = await vendor.text();
    expect(vendorBody).toContain("react@19.2.8");
    const transitive = vendorBody.match(/["']([^"']+react@19\.2\.8[^"']*)["']/)![1];
    expect(new URL(transitive, "https://hub.example").searchParams.getAll("preview")).toEqual([capability]);
    const transitiveUrl = new URL(transitive, "https://hub.example");
    expect((await getDraftVendor(new Request(transitiveUrl), { params: Promise.resolve({ draftId, path: draftVendorPath(transitiveUrl) }) })).status).toBe(200);

    const duplicatedEntry = new URL(entryUrl, "https://hub.example");
    duplicatedEntry.searchParams.append("preview", capability);
    expect((await getDraftAsset(new Request(duplicatedEntry), { params: Promise.resolve({ draftId, path: draftAssetPath(duplicatedEntry) }) })).status).toBe(404);
    const duplicatedVendor = new URL(vendorUrlObject);
    duplicatedVendor.searchParams.append("preview", capability);
    expect((await getDraftVendor(new Request(duplicatedVendor), { params: Promise.resolve({ draftId, path: draftVendorPath(duplicatedVendor) }) })).status).toBe(404);
  });
});
