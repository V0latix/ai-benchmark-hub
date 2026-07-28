import { readAdminEnvironment } from "../../../../../../lib/admin/env";
import { GitHubBenchmarkWriter } from "../../../../../../lib/github/write-client";
import { verifyLiveDraftPreviewRequest } from "../../../../../../lib/visuals/draft-preview-auth";
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
    if ([...search.keys()].length) {
      return new Response("Preview not available", { status: 404 });
    }
    const preview = await verifyLiveDraftPreviewRequest(
      request,
      environment.sessionSecret,
      draftId,
      new GitHubBenchmarkWriter(environment.githubToken)
    );
    if (!preview) return new Response("Preview not available", { status: 404 });
    const context = resolveVerifiedDraftPreviewContext(preview);
    const previewQuery = new URLSearchParams({ v: previewAssetVersion }).toString();
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
