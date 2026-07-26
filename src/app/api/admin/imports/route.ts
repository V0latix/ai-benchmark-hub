import { randomBytes } from "node:crypto";

import type { AdminEnvironment } from "../../../../lib/admin/env";
import { readAdminEnvironment } from "../../../../lib/admin/env";
import { AdminRequestError, requireAdminMutation } from "../../../../lib/admin/request-guard";
import { GitHubBenchmarkWriter, type BenchmarkGitWriter } from "../../../../lib/github/write-client";
import { beginDraft } from "../../../../lib/imports/draft-service";

type BeginImportDependencies = {
  readEnvironment: () => AdminEnvironment;
  createWriter: (environment: AdminEnvironment) => BenchmarkGitWriter;
  now: () => number;
  random: () => Uint8Array;
};

const defaults: BeginImportDependencies = {
  readEnvironment: readAdminEnvironment,
  createWriter: (environment) => new GitHubBenchmarkWriter(environment.githubToken),
  now: Date.now,
  random: () => randomBytes(16)
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export function createBeginImportHandler(
  dependencies: BeginImportDependencies = defaults
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

    try {
      const writer = dependencies.createWriter(environment);
      const result = await beginDraft(writer, environment.sessionSecret, {
        now: dependencies.now(),
        random: dependencies.random()
      });
      return json(result);
    } catch {
      return json({ error: "Import indisponible" }, 500);
    }
  };
}

export const POST = createBeginImportHandler();
