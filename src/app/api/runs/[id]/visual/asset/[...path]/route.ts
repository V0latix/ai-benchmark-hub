import { SafeGitHubReader } from "../../../../../../../lib/github/client";
import { benchmarkSources } from "../../../../../../../lib/sources/config";
import { getRunById } from "../../../../../../../lib/storage/queries";
import { transformPreviewModule, transformPreviewStylesheet } from "../../../../../../../lib/visuals/module";
import { getRunVisual } from "../../../../../../../components/run-visual";
import { interactivePreviewCorsHeaders } from "../../../../../../../lib/visuals/preview";

function candidates(path: string): string[] {
  return /\.[a-z0-9]+$/i.test(path) ? [path] : [`${path}.tsx`, `${path}.ts`, `${path}.jsx`, `${path}.js`];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params; const requested = path.join("/");
  if (!requested || requested.includes("..")) return new Response("Asset not available", { status: 404 });
  const run = await getRunById(id); if (!run) return new Response("Run not found", { status: 404 });
  const source = benchmarkSources.find((item) => item.id === run.sourceId); if (!source) return new Response("Source not found", { status: 404 });
  const visual = getRunVisual(run, source.branch); if (visual.kind !== "preview") return new Response("Preview not available", { status: 404 });
  const directory = visual.path.split("/").slice(0, -1).join("/"); const artifactSource = { ...source, allowlist: [`${directory}/**`] }; const reader = new SafeGitHubReader();
  for (const candidate of candidates(requested)) {
    for (const filePath of [`${directory}/${candidate}`, `${directory}/public/${candidate}`]) {
      try {
        const text = await reader.readText(artifactSource, filePath); const isModule = /\.[cm]?[jt]sx?$/i.test(filePath);
        return new Response(isModule ? transformPreviewModule(text, filePath) : filePath.endsWith(".css") ? transformPreviewStylesheet(text) : text, { headers: { "Content-Type": isModule ? "text/javascript; charset=utf-8" : filePath.endsWith(".css") ? "text/css; charset=utf-8" : "image/svg+xml", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
      } catch { /* Try the next safe extension or public-file location. */ }
    }
  }
  return new Response("Asset not available", { status: 404 });
}
