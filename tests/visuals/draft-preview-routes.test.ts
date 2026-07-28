import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as setupDraftVisual } from "../../src/app/api/admin/imports/[draftId]/visual/setup/route";
import { GET as getDraftVisual } from "../../src/app/api/admin/imports/[draftId]/visual/route";
import { GET as getDraftAsset } from "../../src/app/api/admin/imports/[draftId]/visual/asset/[...path]/route";
import { GET as getDraftVendor } from "../../src/app/api/admin/imports/[draftId]/visual/vendor/[...path]/route";
import { createAdminSession } from "../../src/lib/admin/auth";
import { signPreviewToken } from "../../src/lib/imports/receipts";

const draftId = "4f3a2d1c4b5e6f708192a3b4c5d6e7f8";
const commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const secret = "preview-test-secret-with-32-bytes";
const branch = `imports/1785072000-${draftId}`;
const nonce = "cd".repeat(16);
const csrf = "preview-route-csrf";

function withPreviewCookie(input: string | URL, cookie: string): Request {
  return new Request(input, { headers: { cookie } });
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

function expectPrivateSubresourceHeaders(response: Response) {
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("no-store");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("draft preview route graph", () => {
  it("keeps preview authority in one strict HttpOnly cookie across HTML, assets, and pinned vendors", async () => {
    vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt$unused$unused");
    vi.stubEnv("ADMIN_SESSION_SECRET", secret);
    vi.stubEnv("BENCHMARK_GITHUB_TOKEN", "unused-test-token");
    vi.stubEnv("NODE_ENV", "production");

    let branchHead: string | null = commitSha;
    const files = new Map([
      ["index.html", '<html><body><a href="https://attacker.example/leave">leave</a><img src="/hero.png"><script type="module" src="/src/main.tsx"></script></body></html>'],
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
      if (url.includes("/repos/Melvynx/benchmarks/git/ref/heads/imports/")) {
        return branchHead
          ? Response.json({ object: { sha: branchHead } })
          : new Response("missing", { status: 404 });
      }
      if (url.includes(`/repos/Melvynx/benchmarks/git/commits/${commitSha}`)) {
        return Response.json({ tree: { sha: "b".repeat(40) }, parents: [{ sha: "c".repeat(40) }] });
      }
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

    const previewToken = signPreviewToken({
      version: 1, draftId, branch, commitSha,
      task: "gmail-clone", appSlug: "2026-07-26-lmarena-model-a",
      nonce, expiresAt: Date.now() + 60_000
    }, secret);
    const visualUrl = `https://hub.example/api/admin/imports/${draftId}/visual`;
    expect(new URL(visualUrl).search).toBe("");
    expect((await getDraftVisual(new Request(visualUrl), { params: Promise.resolve({ draftId }) })).status).toBe(404);
    expect((await getDraftVisual(new Request(`${visualUrl}?preview=${encodeURIComponent(previewToken)}`), { params: Promise.resolve({ draftId }) })).status).toBe(404);

    const setupBody = JSON.stringify({ previewSetupToken: previewToken });
    const setup = await setupDraftVisual(new Request(`${visualUrl}/setup`, {
      method: "POST",
      headers: {
        cookie: `benchmark_admin=${createAdminSession(secret, { csrf })}`,
        origin: "https://hub.example",
        "x-csrf-token": csrf,
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(setupBody))
      },
      body: setupBody
    }), { params: Promise.resolve({ draftId }) });
    expect(setup.status).toBe(204);
    expect(await setup.text()).toBe("");
    const setCookie = setup.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("benchmark_preview=");
    expect(setCookie).toContain(`Path=/api/admin/imports/${draftId}/visual`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Secure");
    const maxAge = Number(setCookie.match(/Max-Age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(300);
    const previewCookie = setCookie.split(";")[0];

    const visual = await getDraftVisual(withPreviewCookie(visualUrl, previewCookie), { params: Promise.resolve({ draftId }) });
    expect(visual.status).toBe(200);
    expect(visual.headers.get("referrer-policy")).toBe("no-referrer");
    expect(visual.headers.get("x-content-type-options")).toBe("nosniff");
    expect(visual.headers.get("cache-control")).toBe("no-store");
    const csp = visual.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/\bhttps?:/);
    const html = await visual.text();
    expect(html).not.toContain(previewToken);
    expect(html).not.toContain("preview=");
    expect(html).toContain('href="https://attacker.example/leave"');
    const entryUrl = JSON.parse(html.match(/previewEntry\.src = ("[^"]+")/)![1]) as string;
    expect(new URL(entryUrl, "https://hub.example").searchParams.get("preview")).toBeNull();
    expect(new URL(entryUrl, "https://hub.example").searchParams.get("v")).toBe("tailwind-2");
    const rootAsset = html.match(/src="([^"]+hero\.png[^"]*)"/)![1];
    expect(new URL(rootAsset, "https://hub.example").searchParams.get("preview")).toBeNull();
    const rootAssetUrl = new URL(rootAsset, "https://hub.example");
    expect((await getDraftAsset(new Request(rootAssetUrl), { params: Promise.resolve({ draftId, path: draftAssetPath(rootAssetUrl) }) })).status).toBe(404);
    const rootAssetResponse = await getDraftAsset(withPreviewCookie(rootAssetUrl, previewCookie), { params: Promise.resolve({ draftId, path: draftAssetPath(rootAssetUrl) }) });
    expect(rootAssetResponse.status).toBe(200);
    expectPrivateSubresourceHeaders(rootAssetResponse);

    const entry = await getDraftAsset(withPreviewCookie(new URL(entryUrl, "https://hub.example"), previewCookie), { params: Promise.resolve({ draftId, path: ["src", "main.tsx"] }) });
    expect(entry.status).toBe(200);
    const moduleBody = await entry.text();
    const widgetSpecifier = moduleBody.match(/from\s+[\"']([^\"']+Widget[^\"']*)[\"']/)![1];
    const styleSpecifier = JSON.parse(moduleBody.match(/new URL\(("[^"]+style\.css[^"]*")/)![1]) as string;
    for (const specifier of [widgetSpecifier, styleSpecifier]) expect(new URL(specifier, new URL(entryUrl, "https://hub.example")).searchParams.get("preview")).toBeNull();
    const vendorUrl = moduleBody.match(/from\s+[\"']([^\"']+\/vendor\/react-dom[^\"']*)[\"']/)![1];
    expect(new URL(vendorUrl, "https://hub.example").searchParams.get("preview")).toBeNull();
    const widgetUrl = new URL(widgetSpecifier, new URL(entryUrl, "https://hub.example"));
    const widget = await getDraftAsset(withPreviewCookie(widgetUrl, previewCookie), { params: Promise.resolve({ draftId, path: draftAssetPath(widgetUrl) }) });
    expect(widget.status).toBe(200);
    const styleUrl = new URL(styleSpecifier, new URL(entryUrl, "https://hub.example"));
    const style = await getDraftAsset(withPreviewCookie(styleUrl, previewCookie), { params: Promise.resolve({ draftId, path: draftAssetPath(styleUrl) }) });
    expect(style.status).toBe(200);
    const styleBody = await style.text();
    const stylesheetUrls = [...styleBody.matchAll(/(?:url\(\s*|@import\s+)[\"']([^\"']+)/g)].map((match) => match[1]);
    const relativeAndRootUrls = stylesheetUrls.filter((url) => !url.startsWith("//") && !/^[a-z]+:/i.test(url));
    expect(relativeAndRootUrls).toHaveLength(4);
    for (const rewritten of relativeAndRootUrls) {
      const stylesheetUrl = new URL(rewritten, styleUrl);
      expect(stylesheetUrl.searchParams.get("preview")).toBeNull();
      if (rewritten.startsWith("/")) expect(stylesheetUrl.pathname).toMatch(new RegExp(`/api/admin/imports/${draftId}/visual/asset/`));
      const stylesheetAsset = await getDraftAsset(withPreviewCookie(stylesheetUrl, previewCookie), { params: Promise.resolve({ draftId, path: draftAssetPath(stylesheetUrl) }) });
      expect(stylesheetAsset.status, rewritten).toBe(200);
    }
    for (const external of stylesheetUrls.filter((url) => url.startsWith("//") || /^[a-z]+:/i.test(url))) expect(new URL(external, styleUrl).searchParams.get("preview")).toBeNull();

    const vendorUrlObject = new URL(vendorUrl, "https://hub.example");
    expect((await getDraftVendor(new Request(vendorUrlObject), { params: Promise.resolve({ draftId, path: draftVendorPath(vendorUrlObject) }) })).status).toBe(404);
    const vendor = await getDraftVendor(withPreviewCookie(vendorUrlObject, previewCookie), { params: Promise.resolve({ draftId, path: draftVendorPath(vendorUrlObject) }) });
    expect(vendor.status).toBe(200);
    expectPrivateSubresourceHeaders(vendor);
    const vendorBody = await vendor.text();
    expect(vendorBody).toContain("react@19.2.8");
    const transitive = vendorBody.match(/["']([^"']+react@19\.2\.8[^"']*)["']/)![1];
    expect(new URL(transitive, "https://hub.example").searchParams.get("preview")).toBeNull();
    const transitiveUrl = new URL(transitive, "https://hub.example");
    expect((await getDraftVendor(withPreviewCookie(transitiveUrl, previewCookie), { params: Promise.resolve({ draftId, path: draftVendorPath(transitiveUrl) }) })).status).toBe(200);

    const queryCapabilityAsset = new URL(entryUrl, "https://hub.example");
    queryCapabilityAsset.searchParams.set("preview", previewToken);
    expect((await getDraftAsset(withPreviewCookie(queryCapabilityAsset, previewCookie), { params: Promise.resolve({ draftId, path: draftAssetPath(queryCapabilityAsset) }) })).status).toBe(404);
    const queryCapabilityVendor = new URL(vendorUrlObject);
    queryCapabilityVendor.searchParams.set("preview", previewToken);
    expect((await getDraftVendor(withPreviewCookie(queryCapabilityVendor, previewCookie), { params: Promise.resolve({ draftId, path: draftVendorPath(queryCapabilityVendor) }) })).status).toBe(404);

    branchHead = "d".repeat(40);
    expect((await getDraftVisual(withPreviewCookie(visualUrl, previewCookie), { params: Promise.resolve({ draftId }) })).status).toBe(404);
    expect((await getDraftAsset(withPreviewCookie(new URL(entryUrl, "https://hub.example"), previewCookie), { params: Promise.resolve({ draftId, path: ["src", "main.tsx"] }) })).status).toBe(404);
    expect((await getDraftVendor(withPreviewCookie(vendorUrlObject, previewCookie), { params: Promise.resolve({ draftId, path: draftVendorPath(vendorUrlObject) }) })).status).toBe(404);

    branchHead = null;
    expect((await getDraftVisual(withPreviewCookie(visualUrl, previewCookie), { params: Promise.resolve({ draftId }) })).status).toBe(404);
    expect((await getDraftAsset(withPreviewCookie(new URL(entryUrl, "https://hub.example"), previewCookie), { params: Promise.resolve({ draftId, path: ["src", "main.tsx"] }) })).status).toBe(404);
    expect((await getDraftVendor(withPreviewCookie(vendorUrlObject, previewCookie), { params: Promise.resolve({ draftId, path: draftVendorPath(vendorUrlObject) }) })).status).toBe(404);

    const expiredToken = signPreviewToken({
      version: 1, draftId, branch, commitSha,
      task: "gmail-clone", appSlug: "2026-07-26-lmarena-model-a",
      nonce, expiresAt: Date.now() - 1
    }, secret);
    const expiredCookie = `benchmark_preview=${expiredToken}`;
    expect((await getDraftVisual(withPreviewCookie(visualUrl, expiredCookie), { params: Promise.resolve({ draftId }) })).status).toBe(404);
  });
});
