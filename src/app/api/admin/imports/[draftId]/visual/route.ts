import { readAdminEnvironment } from "../../../../../../lib/admin/env";
import { GitHubBenchmarkWriter } from "../../../../../../lib/github/write-client";
import { verifyLiveDraftPreview } from "../../../../../../lib/visuals/draft-preview-auth";
import { resolveVerifiedDraftPreviewContext } from "../../../../../../lib/visuals/preview-context";
import {
  adminPreviewCsp,
  injectInteractivePreview,
  injectStandalonePreview,
  previewAssetVersion
} from "../../../../../../lib/visuals/preview";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const draftId = (await params).draftId;
    const environment = readAdminEnvironment();
    const search = new URL(request.url).searchParams;
    const capabilities = search.getAll("preview");
    if (capabilities.length !== 1 || [...search.keys()].some((key) => key !== "preview")) {
      return new Response("Preview not available", { status: 404 });
    }
    const preview = await verifyLiveDraftPreview(
      capabilities[0],
      environment.sessionSecret,
      draftId,
      new GitHubBenchmarkWriter(environment.githubToken)
    );
    if (!preview) return new Response("Preview not available", { status: 404 });
    const context = resolveVerifiedDraftPreviewContext(preview);
    const previewQuery = new URLSearchParams({
      v: previewAssetVersion,
      preview: capabilities[0]
    }).toString();
    const html = await context.reader.readText(context.source, context.entryPath);
    const assetBase = `/api/admin/imports/${encodeURIComponent(draftId)}/visual/asset`;
    let body = injectStandalonePreview(html, assetBase, previewQuery, { nonce: preview.nonce });
    if (/<script\b[^>]*\bsrc=["'](?:\/|\.\/)?src\//i.test(html)) {
      const manifest = JSON.parse(await context.reader.readText(context.source, `${context.artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
      body = injectInteractivePreview(
        html,
        assetBase,
        manifest.dependencies ?? {},
        previewQuery,
        { nonce: preview.nonce }
      );
    }
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": adminPreviewCsp,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
      }
    });
  } catch { return new Response("Preview not available", { status: 404 }); }
}
