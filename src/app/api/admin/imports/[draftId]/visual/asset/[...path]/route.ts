import { readAdminEnvironment } from "../../../../../../../../lib/admin/env";
import { GitHubBenchmarkWriter } from "../../../../../../../../lib/github/write-client";
import { verifyLiveDraftPreviewRequest } from "../../../../../../../../lib/visuals/draft-preview-auth";
import { resolveVerifiedDraftPreviewContext } from "../../../../../../../../lib/visuals/preview-context";
import { compilePreviewStylesheet, extractTailwindCandidates, transformPreviewModule, transformPreviewStylesheet } from "../../../../../../../../lib/visuals/module";
import { getPreviewAssetContentType } from "../../../../../../../../lib/visuals/assets";
import { interactivePreviewCorsHeaders, previewAssetVersion } from "../../../../../../../../lib/visuals/preview";

const candidates = (path: string) => /\.[a-z0-9]+$/i.test(path) ? [path] : [`${path}.tsx`, `${path}.ts`, `${path}.jsx`, `${path}.js`];

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string; path: string[] }> }) {
  try {
    const { draftId, path } = await params; const requested = path.join("/");
    if (!requested || requested.includes("..")) throw new Error("unsafe");
    const environment = readAdminEnvironment();
    const search = new URL(request.url).searchParams;
    const versions = search.getAll("v");
    if (
      versions.length > 1
      || (versions[0] && versions[0] !== previewAssetVersion)
      || search.has("preview")
    ) throw new Error("unauthorized");
    const previewQuery = new URLSearchParams(versions[0] ? { v: versions[0] } : {}).toString();
    const preview = await verifyLiveDraftPreviewRequest(
      request,
      environment.sessionSecret,
      draftId,
      new GitHubBenchmarkWriter(environment.githubToken)
    );
    if (!preview) throw new Error("unauthorized");
    const context = resolveVerifiedDraftPreviewContext(preview);
    const assetBaseUrl = `/api/admin/imports/${encodeURIComponent(draftId)}/visual/asset`;
    for (const candidate of candidates(requested)) for (const filePath of [`${context.artifactDirectory}/${candidate}`, `${context.artifactDirectory}/public/${candidate}`]) {
      try {
        const isModule = /\.[cm]?[jt]sx?$/i.test(filePath), css = filePath.endsWith(".css");
        if (!isModule && !css) { const bytes = await context.reader.readBinary(context.source, filePath); return new Response(new Uint8Array(bytes), { headers: { "Content-Type": getPreviewAssetContentType(filePath), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } }); }
        const text = await context.reader.readText(context.source, filePath);
        const manifest = isModule ? JSON.parse(await context.reader.readText(context.source, `${context.artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> } : null;
        const body = isModule
          ? transformPreviewModule(text, filePath, previewQuery, { assetBaseUrl, dependencies: manifest?.dependencies ?? {} })
          : css && /@import\s+["']tailwindcss["']/i.test(text)
            ? await compilePreviewStylesheet(text, extractTailwindCandidates((await Promise.all((await context.reader.listFiles(context.source)).filter((item) => /\.[cm]?[jt]sx?$/i.test(item)).map((item) => context.reader.readText(context.source, item).catch(() => "")))).join("\n")), { query: previewQuery, assetBaseUrl })
            : transformPreviewStylesheet(text, { query: previewQuery, assetBaseUrl });
        return new Response(body, { headers: { "Content-Type": getPreviewAssetContentType(isModule ? "module.js" : filePath), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
      } catch { /* safe candidate fallback */ }
    }
  } catch { /* intentionally indistinguishable */ }
  return new Response("Asset not available", { status: 404 });
}
