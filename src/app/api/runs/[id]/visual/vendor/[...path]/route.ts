import { getRunVisual } from "../../../../../../../components/run-visual";
import { benchmarkSources } from "../../../../../../../lib/sources/config";
import { getRunById } from "../../../../../../../lib/storage/queries";
import { interactivePreviewCorsHeaders } from "../../../../../../../lib/visuals/preview";
import { getPreviewRuntimeVersions } from "../../../../../../../lib/visuals/runtime";
import { isSafeEsmModulePath, isSafeEsmQuery, rewriteEsmModuleImports } from "../../../../../../../lib/visuals/vendor";

const esmOrigin = "https://esm.sh";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const modulePath = path.join("/");
  const upstreamQuery = new URL(request.url).searchParams.get("upstream") ?? "";
  if (!isSafeEsmModulePath(modulePath) || !isSafeEsmQuery(upstreamQuery)) return new Response("Module not available", { status: 400 });

  const run = await getRunById(id);
  const source = run && benchmarkSources.find((item) => item.id === run.sourceId);
  const visual = run && source ? getRunVisual(run, source.branch) : null;
  if (!run || !source || !visual || visual.kind !== "preview") return new Response("Preview not available", { status: 404 });

  try {
    const artifactDirectory = visual.path.split("/").slice(0, -1).join("/");
    const artifactSource = { ...source, allowlist: [`${artifactDirectory}/package.json`] };
    const runtimeVersions = await getPreviewRuntimeVersions(run.id, artifactSource, artifactDirectory);
    const response = await fetch(`${esmOrigin}/${modulePath}${upstreamQuery ? `?${upstreamQuery}` : ""}`);
    if (!response.ok || new URL(response.url).origin !== esmOrigin) return new Response("Module not available", { status: 502 });
    const body = rewriteEsmModuleImports(await response.text(), `/api/runs/${encodeURIComponent(id)}/visual/vendor`, runtimeVersions);
    return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
  } catch {
    return new Response("Module not available", { status: 502 });
  }
}
