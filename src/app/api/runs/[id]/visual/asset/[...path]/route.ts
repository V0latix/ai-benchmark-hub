import { SafeGitHubReader } from "../../../../../../../lib/github/client";
import { benchmarkSources } from "../../../../../../../lib/sources/config";
import { getRunById } from "../../../../../../../lib/storage/queries";
import { compilePreviewStylesheet, extractTailwindCandidates, transformPreviewModule, transformPreviewStylesheet } from "../../../../../../../lib/visuals/module";
import { getRunVisual } from "../../../../../../../components/run-visual";
import { interactivePreviewCorsHeaders } from "../../../../../../../lib/visuals/preview";
import { getPreviewAssetContentType } from "../../../../../../../lib/visuals/assets";

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
        const isModule = /\.[cm]?[jt]sx?$/i.test(filePath); const isStylesheet = filePath.endsWith(".css");
        if (!isModule && !isStylesheet) {
          const remoteBytes = await reader.readBinary(artifactSource, filePath);
          const body = new Uint8Array(remoteBytes.byteLength); body.set(remoteBytes);
          return new Response(body, { headers: { "Content-Type": getPreviewAssetContentType(filePath), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
        }
        const text = await reader.readText(artifactSource, filePath);
        try {
          const sourceFiles = isStylesheet ? await reader.listFiles(artifactSource) : []; const sourceTexts = isStylesheet ? await Promise.all(sourceFiles.filter((path) => /\.[cm]?[jt]sx?$/i.test(path)).map((path) => reader.readText(artifactSource, path).catch(() => ""))) : [];
          const body = isModule ? transformPreviewModule(text, filePath) : isStylesheet && /@import\s+["']tailwindcss["']/i.test(text) ? await compilePreviewStylesheet(text, extractTailwindCandidates(sourceTexts.join("\n"))) : isStylesheet ? transformPreviewStylesheet(text) : text;
          return new Response(body, { headers: { "Content-Type": getPreviewAssetContentType(isModule ? "module.js" : filePath), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
        } catch (error) { return new Response(error instanceof Error ? error.message : "Asset transform failed", { status: 500 }); }
      } catch { /* Try the next safe extension or public-file location. */ }
    }
  }
  return new Response("Asset not available", { status: 404 });
}
