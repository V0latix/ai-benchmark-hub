import "server-only";

import {
  GitBranchConflictError,
  type BenchmarkGitWriter,
  type GitTreeEntry
} from "../github/write-client";
import {
  MELVYNX_SOURCE_ID,
  MELVYNX_SOURCE_REPO,
  MELVYNX_SOURCE_URL,
  type NormalizedRun
} from "../sources/types";
import { parseWritableImportedRunManifest } from "../storage/import-manifest";
import { verifyDraftToken, type DraftTokenPayload } from "./receipts";

export type PublishDraftInput = {
  draftId: string;
  draftToken: string;
  secret: string;
  now?: number;
};

type DraftMetadata = {
  run_id: string;
  task: string;
  model: string;
  harness: string;
  status: "success";
  app_name: string;
  type: "web-app";
  created_at: string;
  notes?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readDraftMetadata(text: string, draft: DraftTokenPayload): DraftMetadata {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Import draft metadata is invalid");
  }
  if (
    !isRecord(value)
    || value.run_id !== draft.runId
    || value.task !== draft.task
    || typeof value.model !== "string"
    || !value.model
    || value.harness !== "lmarena"
    || value.status !== "success"
    || value.app_name !== draft.appSlug
    || value.type !== "web-app"
    || typeof value.created_at !== "string"
    || !Number.isFinite(Date.parse(value.created_at))
    || (value.notes !== undefined && typeof value.notes !== "string")
  ) {
    throw new Error("Import draft metadata is invalid");
  }
  return value as DraftMetadata;
}

function normalizedRun(metadata: DraftMetadata, artifactRoot: string, metadataPath: string): NormalizedRun {
  return {
    id: `${MELVYNX_SOURCE_ID}-${metadata.run_id}`,
    sourceId: MELVYNX_SOURCE_ID,
    sourceRepo: MELVYNX_SOURCE_REPO,
    sourceUrl: MELVYNX_SOURCE_URL,
    runId: metadata.run_id,
    benchmarkName: null,
    task: metadata.task,
    promptName: null,
    promptPath: null,
    model: metadata.model,
    provider: null,
    harness: metadata.harness,
    status: metadata.status,
    score: null,
    scoreLabel: null,
    durationMs: null,
    totalCostUsd: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    transcriptPath: null,
    resultPath: metadataPath,
    evidencePath: null,
    previewPath: `${artifactRoot}/index.html`,
    screenshotPath: null,
    createdAt: metadata.created_at,
    updatedAt: null,
    tags: ["melvynx", "lmarena"],
    raw: metadata
  };
}

function manifestBytes(runs: NormalizedRun[]): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ version: 1, runs }, null, 2)}\n`);
}

function pathKey(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

function assertUnreservedMainDestinations(
  entries: Array<{ path: string; type: string }>,
  roots: string[]
): void {
  for (const rootValue of roots) {
    const root = pathKey(rootValue);
    const collision = entries.some((entry) => {
      const path = pathKey(entry.path);
      return path === root
        || path.startsWith(`${root}/`)
        || (root.startsWith(`${path}/`) && entry.type !== "tree");
    });
    if (collision) throw new Error("Import destination collision on immutable main content");
  }
}

export async function publishDraft(
  input: PublishDraftInput,
  writer: BenchmarkGitWriter
): Promise<{ run: NormalizedRun; cleanupWarning: string | null }> {
  const draft = verifyDraftToken(
    input.draftToken,
    input.secret,
    input.draftId,
    input.now ?? Date.now()
  );
  if (!draft) throw new Error("Invalid or expired import draft");

  const draftHead = await writer.getHead(draft.branch);
  if (draftHead.commitSha !== draft.commitSha) throw new Error("Import draft no longer matches its token");

  const artifactRoot = `benchmarks/${draft.task}/${draft.appSlug}`;
  const metadataPath = `runs/${draft.runId}/data/${draft.task}/metadata.json`;
  const draftCommit = await writer.getCommit(draft.commitSha);
  const draftEntries = await writer.listTree(draft.commitSha);
  const parentEntries = await writer.listTree(draftCommit.parentSha);
  const parentBlobs = new Map(
    parentEntries.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha])
  );
  const draftBlobs = new Map(
    draftEntries.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha])
  );
  const changedDraftBlobs = [...draftBlobs].filter(([path, sha]) => parentBlobs.get(path) !== sha);
  const deletedDraftBlobs = [...parentBlobs].filter(([path]) => !draftBlobs.has(path));
  if (
    deletedDraftBlobs.length > 0
    || changedDraftBlobs.some(([path]) => (
      !path.startsWith(`${artifactRoot}/`) && path !== metadataPath
    ))
  ) {
    throw new Error("Import draft tree contains changes outside its exact destinations");
  }
  const publishEntries: GitTreeEntry[] = changedDraftBlobs.map(([path, sha]) => ({
    path,
    mode: "100644",
    type: "blob",
    sha
  }));
  if (
    !publishEntries.some((entry) => entry.path === `${artifactRoot}/index.html`)
    || publishEntries.filter((entry) => entry.path === metadataPath).length !== 1
  ) {
    throw new Error("Import draft tree is incomplete");
  }
  const metadataText = await writer.readText(metadataPath, draft.commitSha);
  if (!metadataText) throw new Error("Import draft metadata is missing");
  const metadata = readDraftMetadata(metadataText, draft);
  const run = normalizedRun(metadata, artifactRoot, metadataPath);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mainHead = await writer.getHead("main");
    const manifestText = await writer.readText("imports/index.json", mainHead.commitSha);
    const manifest = parseWritableImportedRunManifest(manifestText);
    const mainEntries = await writer.listTree(mainHead.commitSha);
    assertUnreservedMainDestinations(mainEntries, [
      artifactRoot,
      `runs/${draft.runId}`
    ]);
    const artifactRootKey = pathKey(artifactRoot);
    const runRootKey = pathKey(`runs/${draft.runId}`);
    if (manifest.runs.some((existing) => {
      const previewPath = existing.previewPath ? pathKey(existing.previewPath) : null;
      const resultPath = existing.resultPath ? pathKey(existing.resultPath) : null;
      return existing.id === run.id
        || existing.runId === draft.runId
        || previewPath === artifactRootKey
        || previewPath?.startsWith(`${artifactRootKey}/`)
        || resultPath === runRootKey
        || resultPath?.startsWith(`${runRootKey}/`);
    })) {
      throw new Error("Import run identity collision");
    }
    const manifestSha = await writer.createBlob(manifestBytes([...manifest.runs, run]));
    const treeSha = await writer.createTree(mainHead.treeSha, [
      ...publishEntries,
      { path: "imports/index.json", mode: "100644", type: "blob", sha: manifestSha }
    ]);
    const commitSha = await writer.createCommit(
      `Publish LM Arena import ${draft.runId}`,
      treeSha,
      mainHead.commitSha
    );
    try {
      await writer.updateBranch("main", commitSha);
    } catch (error) {
      if (error instanceof GitBranchConflictError && attempt === 0) continue;
      throw error;
    }

    let cleanupWarning: string | null = null;
    try {
      await writer.deleteBranch(draft.branch);
    } catch {
      cleanupWarning = "Published run, but the temporary draft could not be removed";
    }
    return { run, cleanupWarning };
  }
  throw new Error("Import publication conflict");
}
