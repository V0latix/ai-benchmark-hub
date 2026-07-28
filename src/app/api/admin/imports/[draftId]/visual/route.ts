import { readAdminEnvironment } from "../../../../../../lib/admin/env";
import { signPreviewToken, verifyDraftToken } from "../../../../../../lib/imports/receipts";
import { resolveDraftPreviewContext } from "../../../../../../lib/visuals/preview-context";
import { injectInteractivePreview, injectStandalonePreview, interactivePreviewCsp, previewAssetVersion } from "../../../../../../lib/visuals/preview";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const draftId = (await params).draftId;
    const secret = readAdminEnvironment().sessionSecret;
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const draft = verifyDraftToken(token, secret, draftId);
    if (!draft) return new Response("Preview not available", { status: 404 });
    const context = await resolveDraftPreviewContext({ draftId, token }, { secret });
    const previewToken = signPreviewToken({ version: 1, draftId, commitSha: draft.commitSha, task: draft.task, appSlug: draft.appSlug, expiresAt: Math.min(draft.expiresAt, Date.now() + 5 * 60_000) }, secret);
    const previewQuery = new URLSearchParams({ v: previewAssetVersion, preview: previewToken }).toString();
    const html = await context.reader.readText(context.source, context.entryPath);
    const assetBase = `/api/admin/imports/${encodeURIComponent(draftId)}/visual/asset`;
    let body = injectStandalonePreview(html, assetBase, previewQuery);
    if (/<script\b[^>]*\bsrc=["']\/src\//i.test(html)) {
      const manifest = JSON.parse(await context.reader.readText(context.source, `${context.artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
      body = injectInteractivePreview(html, assetBase, manifest.dependencies ?? {}, previewQuery);
    }
    return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": interactivePreviewCsp, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
  } catch { return new Response("Preview not available", { status: 404 }); }
}
