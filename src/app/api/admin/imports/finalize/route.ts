import type { AdminEnvironment } from "../../../../../lib/admin/env";
import { readAdminEnvironment } from "../../../../../lib/admin/env";
import { AdminRequestError, requireAdminMutation } from "../../../../../lib/admin/request-guard";
import { GitHubBenchmarkWriter, type BenchmarkGitWriter } from "../../../../../lib/github/write-client";
import {
  finalizeDraft,
  type FinalizeDraftInput
} from "../../../../../lib/imports/draft-service";

const MAX_FINALIZE_BODY_BYTES = 1_000_000;

type FinalizeImportDependencies = {
  readEnvironment: () => AdminEnvironment;
  createWriter: (environment: AdminEnvironment) => BenchmarkGitWriter;
  now: () => number;
};

const defaults: FinalizeImportDependencies = {
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

function readBodyLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (!value || !/^(?:0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isFinalizeInput(value: unknown): value is FinalizeDraftInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<FinalizeDraftInput>;
  return typeof input.draftId === "string"
    && Array.isArray(input.receipts)
    && input.receipts.every((receipt) => typeof receipt === "string")
    && Boolean(input.metadata)
    && typeof input.metadata === "object";
}

export function createFinalizeImportHandler(
  dependencies: FinalizeImportDependencies = defaults
): (request: Request) => Promise<Response> {
  return async (request) => {
    let environment: AdminEnvironment;
    try {
      environment = dependencies.readEnvironment();
      await requireAdminMutation(request, environment);
    } catch (error) {
      return error instanceof AdminRequestError
        ? json({ error: "Accès refusé" }, 401)
        : json({ error: "Import indisponible" }, 500);
    }

    const declaredLength = readBodyLength(request);
    if (declaredLength === null) return json({ error: "Import invalide" }, 400);
    if (declaredLength > MAX_FINALIZE_BODY_BYTES) return json({ error: "Import trop volumineux" }, 413);

    try {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength !== declaredLength || bytes.byteLength > MAX_FINALIZE_BODY_BYTES) {
        return json({ error: "Import invalide" }, 400);
      }
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!isFinalizeInput(value)) return json({ error: "Import invalide" }, 400);

      const result = await finalizeDraft(
        value,
        dependencies.createWriter(environment),
        environment.sessionSecret,
        { now: dependencies.now() }
      );
      return json({
        draftToken: result.draftToken,
        previewUrl: result.previewUrl,
        previewNonce: result.previewNonce
      });
    } catch {
      return json({ error: "Import invalide" }, 400);
    }
  };
}

export const POST = createFinalizeImportHandler();
