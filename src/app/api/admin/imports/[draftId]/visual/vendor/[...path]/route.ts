import { readAdminEnvironment } from "../../../../../../../../lib/admin/env";
import { GitHubBenchmarkWriter } from "../../../../../../../../lib/github/write-client";
import { verifyLiveDraftPreviewRequest } from "../../../../../../../../lib/visuals/draft-preview-auth";
import { resolveVerifiedDraftPreviewContext } from "../../../../../../../../lib/visuals/preview-context";
import { interactivePreviewCorsHeaders, previewAssetVersion } from "../../../../../../../../lib/visuals/preview";
import { getPreviewRuntimeVersions } from "../../../../../../../../lib/visuals/runtime";
import { isSafeEsmModulePath, isSafeEsmQuery, rewriteEsmModuleImports } from "../../../../../../../../lib/visuals/vendor";

const esmOrigin = "https://esm.sh";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string; path: string[] }> }) {
  const { draftId, path } = await params; const modulePath = path.join("/"); const url = new URL(request.url);
  const upstream = url.searchParams.get("upstream") ?? "";
  const versions = url.searchParams.getAll("v");
  if (
    url.searchParams.getAll("upstream").length > 1
    || versions.length > 1
    || (versions[0] && versions[0] !== previewAssetVersion)
    || [...url.searchParams.keys()].some((key) => key !== "v" && key !== "upstream")
  ) return new Response("Module not available", { status: 404 });
  const environment = readAdminEnvironment();
  const preview = await verifyLiveDraftPreviewRequest(
    request,
    environment.sessionSecret,
    draftId,
    new GitHubBenchmarkWriter(environment.githubToken)
  );
  if (!preview || !isSafeEsmModulePath(modulePath) || !isSafeEsmQuery(upstream)) return new Response("Module not available", { status: 404 });
  try {
    const context = resolveVerifiedDraftPreviewContext(preview);
    const runtimeVersions = await getPreviewRuntimeVersions(`${draftId}:${preview.commitSha}`, context.source, context.artifactDirectory, context.reader);
    const response = await fetch(`${esmOrigin}/${modulePath}${upstream ? `?${upstream}` : ""}`);
    if (!response.ok || new URL(response.url).origin !== esmOrigin) throw new Error("upstream");
    const vendorBase = `/api/admin/imports/${encodeURIComponent(draftId)}/visual/vendor`;
    const previewQuery = new URLSearchParams(versions[0] ? { v: versions[0] } : {}).toString();
    const body = rewriteEsmModuleImports(await response.text(), vendorBase, runtimeVersions, previewQuery);
    return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
  } catch { return new Response("Module not available", { status: 404 }); }
}
