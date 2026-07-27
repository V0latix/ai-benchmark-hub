import { resolvePublicPreviewContext } from "../../../../../lib/visuals/preview-context";
import { getPreviewAssetBaseUrl, injectInteractivePreview, injectStandalonePreview, interactivePreviewCsp } from "../../../../../lib/visuals/preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const context = await resolvePublicPreviewContext(id);
  if (!context) return new Response("Preview not available", { status: 404 });
  try {
    const html = await context.reader.readText(context.source, context.entryPath);
    const assetBaseUrl = getPreviewAssetBaseUrl(id);
    const isVitePreview = /<script\b[^>]*\bsrc=["']\/src\/[^"']+["'][^>]*><\/script>/i.test(html);
    let previewHtml = injectStandalonePreview(html, assetBaseUrl);
    if (isVitePreview) {
      const manifest = JSON.parse(await context.reader.readText(context.source, `${context.artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
      previewHtml = injectInteractivePreview(html, assetBaseUrl, manifest.dependencies ?? {});
    }
    return new Response(previewHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": interactivePreviewCsp,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return new Response("Preview not available", { status: 404 });
  }
}
