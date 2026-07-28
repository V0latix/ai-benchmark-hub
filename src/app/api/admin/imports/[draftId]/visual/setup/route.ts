import { readAdminEnvironment } from "../../../../../../../lib/admin/env";
import { AdminRequestError, requireAdminMutation } from "../../../../../../../lib/admin/request-guard";
import { GitHubBenchmarkWriter } from "../../../../../../../lib/github/write-client";
import {
  serializeAdminPreviewCookie,
  verifyLiveDraftPreview
} from "../../../../../../../lib/visuals/draft-preview-auth";

const MAX_SETUP_BODY_BYTES = 16_384;

function unavailable(status = 404): Response {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
): Promise<Response> {
  try {
    const draftId = (await params).draftId;
    const environment = readAdminEnvironment();
    try {
      await requireAdminMutation(request, environment);
    } catch (error) {
      return unavailable(error instanceof AdminRequestError ? 401 : 404);
    }

    const contentLength = request.headers.get("content-length");
    if (
      contentLength !== null
      && (!/^(?:0|[1-9][0-9]*)$/.test(contentLength) || Number(contentLength) > MAX_SETUP_BODY_BYTES)
    ) {
      return unavailable();
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_SETUP_BODY_BYTES) return unavailable();
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable();
    const body = value as Record<string, unknown>;
    if (
      Object.keys(body).sort().join(",") !== "previewSetupToken"
      || typeof body.previewSetupToken !== "string"
    ) {
      return unavailable();
    }

    const now = Date.now();
    const preview = await verifyLiveDraftPreview(
      body.previewSetupToken,
      environment.sessionSecret,
      draftId,
      new GitHubBenchmarkWriter(environment.githubToken),
      now
    );
    if (!preview) return unavailable();
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": serializeAdminPreviewCookie(
          body.previewSetupToken,
          preview,
          draftId,
          now
        )
      }
    });
  } catch {
    return unavailable();
  }
}
