import { getRunVisual } from "../../../../../components/run-visual";
import { SafeGitHubReader } from "../../../../../lib/github/client";
import { benchmarkSources } from "../../../../../lib/sources/config";
import { getRunById } from "../../../../../lib/storage/queries";
import { getPreviewAssetBaseUrl, injectInteractivePreview, injectStandalonePreview, interactivePreviewCsp } from "../../../../../lib/visuals/preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const run = await getRunById((await params).id);
  if (!run) return new Response("Run not found", { status: 404 });
  const source = benchmarkSources.find((item) => item.id === run.sourceId);
  if (!source) return new Response("Source not found", { status: 404 });
  const visual = getRunVisual(run, source.branch);
  if (visual.kind !== "preview") return new Response("Preview not available", { status: 404 });
  try {
    const html = await new SafeGitHubReader().readText(source, visual.path);
    const artifactDirectory = visual.path.split("/").slice(0, -1).join("/");
    const assetBaseUrl = getPreviewAssetBaseUrl(run.id);
    const isVitePreview = /<script\b[^>]*\bsrc=["']\/src\/[^"']+["'][^>]*><\/script>/i.test(html);
    let previewHtml = injectStandalonePreview(html, assetBaseUrl);
    if (isVitePreview) {
      const artifactSource = { ...source, allowlist: [`${artifactDirectory}/package.json`] };
      const manifest = JSON.parse(await new SafeGitHubReader().readText(artifactSource, `${artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
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
