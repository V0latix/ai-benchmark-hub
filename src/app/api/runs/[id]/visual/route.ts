import { getRunVisual } from "../../../../../components/run-visual";
import { SafeGitHubReader } from "../../../../../lib/github/client";
import { benchmarkSources } from "../../../../../lib/sources/config";
import { getRunById } from "../../../../../lib/storage/queries";
import { getPreviewAssetBase, injectPreviewBase } from "../../../../../lib/visuals/preview";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const run = await getRunById((await params).id);
  if (!run) return new Response("Run not found", { status: 404 });
  const source = benchmarkSources.find((item) => item.id === run.sourceId);
  if (!source) return new Response("Source not found", { status: 404 });
  const visual = getRunVisual(run, source.branch);
  if (visual.kind !== "preview") return new Response("Preview not available", { status: 404 });
  try {
    const html = await new SafeGitHubReader().readText(source, visual.path);
    return new Response(injectPreviewBase(html, getPreviewAssetBase(run.sourceRepo, source.branch, visual.path)), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "sandbox; default-src https: data:; script-src 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch {
    return new Response("Preview not available", { status: 404 });
  }
}
