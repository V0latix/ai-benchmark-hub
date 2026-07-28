import { revalidatePath, revalidateTag } from "next/cache";

import type { AdminEnvironment } from "../../../../../../lib/admin/env";
import { readAdminEnvironment } from "../../../../../../lib/admin/env";
import {
  AdminRequestError,
  requireAdminMutation
} from "../../../../../../lib/admin/request-guard";
import {
  GitHubBenchmarkWriter,
  type BenchmarkGitWriter
} from "../../../../../../lib/github/write-client";
import { publishDraft } from "../../../../../../lib/imports/publish-service";

const MAX_BODY_BYTES = 64_000;

type PublishRouteDependencies = {
  readEnvironment: () => AdminEnvironment;
  createWriter: (environment: AdminEnvironment) => BenchmarkGitWriter;
  now: () => number;
  revalidateTag: (tag: string, profile: { expire: 0 }) => void;
  revalidatePath: (path: string) => void;
};

const defaults: PublishRouteDependencies = {
  readEnvironment: readAdminEnvironment,
  createWriter: (environment) => new GitHubBenchmarkWriter(environment.githubToken),
  now: Date.now,
  revalidateTag: (tag, profile) => revalidateTag(tag, profile),
  revalidatePath
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

async function readDraftToken(request: Request): Promise<string | null> {
  const header = request.headers.get("content-length");
  if (!header || !/^[1-9][0-9]*$/.test(header)) return null;
  const length = Number(header);
  if (!Number.isSafeInteger(length) || length > MAX_BODY_BYTES) return null;
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength !== length || bytes.byteLength > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 1 && typeof record.draftToken === "string"
      ? record.draftToken
      : null;
  } catch {
    return null;
  }
}

export function createPublishImportHandler(
  dependencies: PublishRouteDependencies = defaults
): (
  request: Request,
  context: { params: Promise<{ draftId: string }> }
) => Promise<Response> {
  return async (request, context) => {
    let environment: AdminEnvironment;
    try {
      environment = dependencies.readEnvironment();
      await requireAdminMutation(request, environment);
    } catch (error) {
      return error instanceof AdminRequestError
        ? json({ error: "Accès refusé" }, 401)
        : json({ error: "Publication indisponible" }, 500);
    }

    const draftToken = await readDraftToken(request);
    if (!draftToken) return json({ error: "Publication invalide" }, 400);

    try {
      const { draftId } = await context.params;
      const result = await publishDraft({
        draftId,
        draftToken,
        secret: environment.sessionSecret,
        now: dependencies.now()
      }, dependencies.createWriter(environment));
      const runUrl = `/runs/${encodeURIComponent(result.run.id)}`;
      const taskUrl = `/tasks/${encodeURIComponent(result.run.task!)}`;
      dependencies.revalidateTag("melvynx-imports", { expire: 0 });
      dependencies.revalidatePath("/");
      dependencies.revalidatePath(taskUrl);
      dependencies.revalidatePath(runUrl);
      return json({
        run: result.run,
        runUrl,
        taskUrl,
        cleanupWarning: result.cleanupWarning
      });
    } catch {
      return json({ error: "Publication impossible; le brouillon reste disponible" }, 409);
    }
  };
}

export const POST = createPublishImportHandler();
