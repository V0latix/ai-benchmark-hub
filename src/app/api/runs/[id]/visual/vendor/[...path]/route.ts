import { getRunVisual } from "../../../../../../../components/run-visual";
import { SafeGitHubReader } from "../../../../../../../lib/github/client";
import { benchmarkSources } from "../../../../../../../lib/sources/config";
import { getRunById } from "../../../../../../../lib/storage/queries";
import { interactivePreviewCorsHeaders } from "../../../../../../../lib/visuals/preview";
import { getEsmPackageVersion, isSafeEsmModulePath, isSafeEsmQuery, rewriteEsmModuleImports } from "../../../../../../../lib/visuals/vendor";

const esmOrigin = "https://esm.sh";
type RuntimeVersions = Partial<Record<"react" | "react-dom", string>>;
const runtimeVersionsCache = new Map<string, Promise<RuntimeVersions>>();

async function resolveRuntimeVersion(packageName: "react" | "react-dom", declaredVersion: string | undefined): Promise<string | undefined> {
  if (!declaredVersion || !isSafeEsmModulePath(`${packageName}@${declaredVersion}`)) return declaredVersion;
  const response = await fetch(`${esmOrigin}/${packageName}@${declaredVersion}?target=es2022`);
  if (!response.ok || new URL(response.url).origin !== esmOrigin) return declaredVersion;
  return getEsmPackageVersion(await response.text(), packageName) ?? declaredVersion;
}

function getRuntimeVersions(cacheKey: string, source: typeof benchmarkSources[number], artifactDirectory: string): Promise<RuntimeVersions> {
  const cached = runtimeVersionsCache.get(cacheKey);
  if (cached) return cached;
  const runtimeVersions = (async () => {
    const artifactSource = { ...source, allowlist: [`${artifactDirectory}/package.json`] };
    const manifest = JSON.parse(await new SafeGitHubReader().readText(artifactSource, `${artifactDirectory}/package.json`)) as { dependencies?: Record<string, string> };
    const [react, reactDom] = await Promise.all([
      resolveRuntimeVersion("react", manifest.dependencies?.react),
      resolveRuntimeVersion("react-dom", manifest.dependencies?.["react-dom"])
    ]);
    return { react, "react-dom": reactDom };
  })();
  runtimeVersionsCache.set(cacheKey, runtimeVersions);
  runtimeVersions.catch(() => runtimeVersionsCache.delete(cacheKey));
  return runtimeVersions;
}

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
    const runtimeVersions = await getRuntimeVersions(run.id, source, artifactDirectory);
    const response = await fetch(`${esmOrigin}/${modulePath}${upstreamQuery ? `?${upstreamQuery}` : ""}`);
    if (!response.ok || new URL(response.url).origin !== esmOrigin) return new Response("Module not available", { status: 502 });
    const body = rewriteEsmModuleImports(await response.text(), `/api/runs/${encodeURIComponent(id)}/visual/vendor`, runtimeVersions);
    return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
  } catch {
    return new Response("Module not available", { status: 502 });
  }
}
