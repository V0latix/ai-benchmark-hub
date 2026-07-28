import type { AdminEnvironment } from "../../../../../lib/admin/env";
import { readAdminEnvironment } from "../../../../../lib/admin/env";
import {
  AdminRequestError,
  requireAdminMutation
} from "../../../../../lib/admin/request-guard";
import {
  GitHubBenchmarkWriter,
  type BenchmarkGitWriter
} from "../../../../../lib/github/write-client";
import { cancelDraft } from "../../../../../lib/imports/draft-service";

const MAX_BODY_BYTES = 64_000;

type CancelRouteDependencies = {
  readEnvironment: () => AdminEnvironment;
  createWriter: (environment: AdminEnvironment) => BenchmarkGitWriter;
  now: () => number;
};

const defaults: CancelRouteDependencies = {
  readEnvironment: readAdminEnvironment,
  createWriter: (environment) => new GitHubBenchmarkWriter(environment.githubToken),
  now: Date.now
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

export function createCancelImportHandler(
  dependencies: CancelRouteDependencies = defaults
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
        : json({ error: "Annulation indisponible" }, 500);
    }

    const draftToken = await readDraftToken(request);
    if (!draftToken) return json({ error: "Annulation invalide" }, 400);

    try {
      const { draftId } = await context.params;
      await cancelDraft({
        draftId,
        draftToken,
        secret: environment.sessionSecret,
        now: dependencies.now()
      }, dependencies.createWriter(environment));
      return json({ cancelled: true });
    } catch {
      return json({ error: "Annulation impossible" }, 409);
    }
  };
}

export const DELETE = createCancelImportHandler();
