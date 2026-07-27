import { readAdminEnvironment } from "../../../../../../../../lib/admin/env";
import { verifyPreviewTokenForDraft } from "../../../../../../../../lib/imports/receipts";
import { interactivePreviewCorsHeaders } from "../../../../../../../../lib/visuals/preview";
import { getEsmPackageVersion, isSafeEsmModulePath, isSafeEsmQuery, rewriteEsmModuleImports } from "../../../../../../../../lib/visuals/vendor";

const esmOrigin = "https://esm.sh";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string; path: string[] }> }) {
  const { draftId, path } = await params; const modulePath = path.join("/"); const url = new URL(request.url);
  const upstream = url.searchParams.get("upstream") ?? "";
  const preview = verifyPreviewTokenForDraft(url.searchParams.get("preview") ?? "", readAdminEnvironment().sessionSecret, draftId);
  if (!preview || !isSafeEsmModulePath(modulePath) || !isSafeEsmQuery(upstream)) return new Response("Module not available", { status: 404 });
  try {
    const response = await fetch(`${esmOrigin}/${modulePath}${upstream ? `?${upstream}` : ""}`);
    if (!response.ok || new URL(response.url).origin !== esmOrigin) throw new Error("upstream");
    const vendorBase = `/api/admin/imports/${encodeURIComponent(draftId)}/visual/vendor`;
    const authorization = `preview=${encodeURIComponent(url.searchParams.get("preview")!)}`;
    const body = rewriteEsmModuleImports(await response.text(), vendorBase)
      .replace(new RegExp(`(${vendorBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^"'\\s)]+)(?=["'\\s)])`, "g"), (target) => `${target}${target.includes("?") ? "&" : "?"}${authorization}`);
    return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...interactivePreviewCorsHeaders } });
  } catch { return new Response("Module not available", { status: 502 }); }
}
