import type { AdminEnvironment } from "../../../../../lib/admin/env";
import { readAdminEnvironment } from "../../../../../lib/admin/env";
import { AdminRequestError, requireAdminMutation } from "../../../../../lib/admin/request-guard";
import { GitHubBenchmarkWriter, type BenchmarkGitWriter } from "../../../../../lib/github/write-client";
import { validateImportFile } from "../../../../../lib/imports/policy";
import {
  IMPORT_TOKEN_TTL_MS,
  signFileReceipt,
  verifyUploadToken
} from "../../../../../lib/imports/receipts";
import { IMPORT_LIMITS } from "../../../../../lib/imports/types";

type UploadImportFileDependencies = {
  readEnvironment: () => AdminEnvironment;
  createWriter: (environment: AdminEnvironment) => BenchmarkGitWriter;
  now: () => number;
};

const defaults: UploadImportFileDependencies = {
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

function decodeHeader(request: Request, name: string, maxEncodedLength: number): string | null {
  const encoded = request.headers.get(name);
  if (!encoded || encoded.length > maxEncodedLength) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    return encodeURIComponent(decoded) === encoded ? decoded : null;
  } catch {
    return null;
  }
}

export function createUploadImportFileHandler(
  dependencies: UploadImportFileDependencies = defaults
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
    if (declaredLength === null) return json({ error: "Fichier invalide" }, 400);
    if (declaredLength > IMPORT_LIMITS.fileBytes) return json({ error: "Fichier trop volumineux" }, 413);

    const now = dependencies.now();
    const uploadToken = request.headers.get("x-import-upload-token");
    const path = decodeHeader(request, "x-import-path", 4_096);
    const contentType = decodeHeader(request, "x-import-content-type", 512);
    const upload = uploadToken ? verifyUploadToken(uploadToken, environment.sessionSecret, now) : null;
    if (!upload || path === null || contentType === null) return json({ error: "Fichier invalide" }, 400);

    try {
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength !== declaredLength || bytes.byteLength > IMPORT_LIMITS.fileBytes) {
        return json({ error: "Fichier invalide" }, 400);
      }
      const validated = validateImportFile({ path, bytes, contentType });
      const blobSha = await dependencies.createWriter(environment).createBlob(validated.bytes);
      const receipt = signFileReceipt({
        version: 1,
        draftId: upload.draftId,
        path: validated.path,
        blobSha,
        size: validated.bytes.byteLength,
        contentType: validated.contentType,
        expiresAt: Math.min(upload.expiresAt, now + IMPORT_TOKEN_TTL_MS)
      }, environment.sessionSecret);
      return json({ receipt });
    } catch {
      return json({ error: "Fichier invalide" }, 400);
    }
  };
}

export const POST = createUploadImportFileHandler();
