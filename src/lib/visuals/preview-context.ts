import "server-only";

import { getRunVisual } from "../../components/run-visual";
import { SafeGitHubReader } from "../github/client";
import { verifyDraftToken, type PreviewTokenBinding } from "../imports/receipts";
import { benchmarkSources } from "../sources/config";
import type { BenchmarkSource } from "../sources/types";
import { getRunById } from "../storage/queries";

export type PreviewContext = {
  ref: string;
  artifactDirectory: string;
  entryPath: string;
  source: BenchmarkSource;
  reader: SafeGitHubReader;
};

export type DraftPreviewContextInput = {
  draftId: string;
  token: string;
  requestedPath?: string;
};

type DraftPreviewContextOptions = {
  secret: string;
  now?: number;
  reader?: SafeGitHubReader;
};

function sourceForArtifact(source: BenchmarkSource, ref: string, artifactDirectory: string): BenchmarkSource {
  return { ...source, branch: ref, allowlist: [`${artifactDirectory}/**`] };
}

export async function resolvePublicPreviewContext(
  runId: string,
  reader: SafeGitHubReader = new SafeGitHubReader()
): Promise<PreviewContext | null> {
  const run = await getRunById(runId);
  if (!run) return null;
  const source = benchmarkSources.find((item) => item.id === run.sourceId);
  if (!source) return null;
  const visual = getRunVisual(run, source.branch);
  if (visual.kind !== "preview") return null;
  const artifactDirectory = visual.path.split("/").slice(0, -1).join("/");
  return {
    ref: source.branch,
    artifactDirectory,
    entryPath: visual.path,
    source: sourceForArtifact(source, source.branch, artifactDirectory),
    reader
  };
}

export async function resolveDraftPreviewContext(
  input: DraftPreviewContextInput,
  options: DraftPreviewContextOptions
): Promise<PreviewContext> {
  const payload = verifyDraftToken(input.token, options.secret, input.draftId, options.now);
  if (!payload) throw new Error("Draft preview is not authorized");
  const source = benchmarkSources.find((item) => item.id === "melvynx-benchmarks");
  if (!source) throw new Error("Preview source is not available");
  const artifactDirectory = `benchmarks/${payload.task}/${payload.appSlug}`;
  return {
    ref: payload.commitSha,
    artifactDirectory,
    entryPath: `${artifactDirectory}/index.html`,
    source: sourceForArtifact(source, payload.commitSha, artifactDirectory),
    reader: options.reader ?? new SafeGitHubReader()
  };
}

export function resolveVerifiedDraftPreviewContext(
  binding: PreviewTokenBinding,
  reader: SafeGitHubReader = new SafeGitHubReader()
): PreviewContext {
  const source = benchmarkSources.find((item) => item.id === "melvynx-benchmarks");
  if (!source) throw new Error("Preview source is not available");
  const artifactDirectory = `benchmarks/${binding.task}/${binding.appSlug}`;
  return { ref: binding.commitSha, artifactDirectory, entryPath: `${artifactDirectory}/index.html`, source: sourceForArtifact(source, binding.commitSha, artifactDirectory), reader };
}
