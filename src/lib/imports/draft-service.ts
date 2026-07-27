import "server-only";

import { randomBytes } from "node:crypto";

import type { BenchmarkGitWriter, GitTreeEntry } from "../github/write-client";
import { getMelvynxTaskPrompt } from "../tasks/catalog";
import { importPathKey } from "./policy";
import {
  createDraftId,
  IMPORT_TOKEN_TTL_MS,
  signDraftToken,
  signUploadToken,
  verifyFileReceipt,
  type FileReceiptPayload
} from "./receipts";
import { IMPORT_LIMITS } from "./types";

export type DraftMetadataInput = {
  task: string;
  model: string;
  harness: "lmarena";
  createdAt: string;
  notes: string;
};

export type FinalizeDraftInput = {
  metadata: DraftMetadataInput;
  receipts: string[];
  draftId: string;
};

type ClockOptions = {
  now?: number;
};

type BeginDraftOptions = ClockOptions & {
  random?: Uint8Array;
};

type NormalizedDraftMetadata = {
  task: string;
  model: string;
  harness: "lmarena";
  createdAt: string;
  notes: string;
  modelSlug: string;
  appSlug: string;
  runId: string;
};

const staleBranchPattern = /^imports\/([0-9]{10,})-([a-f0-9]{32,})$/;
const draftIdPattern = /^[a-f0-9]{32,}$/;

function requiredNow(now: number): number {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid import clock");
  return now;
}

function slugify(value: string): string {
  return value.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`Invalid import ${field}`);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`Invalid import ${field}`);
  }
  return normalized;
}

function normalizeMetadata(value: DraftMetadataInput): NormalizedDraftMetadata {
  if (!value || typeof value !== "object") throw new Error("Invalid import metadata");
  const task = normalizedText(value.task, "task", 100);
  if (!getMelvynxTaskPrompt(task)) throw new Error("Import task is not canonical");
  const model = normalizedText(value.model, "model", 100);
  if (value.harness !== "lmarena") throw new Error("Import harness must be lmarena");

  const parsedCreatedAt = Date.parse(value.createdAt);
  if (!Number.isFinite(parsedCreatedAt) || new Date(parsedCreatedAt).toISOString() !== value.createdAt) {
    throw new Error("Invalid import creation time");
  }
  const notes = typeof value.notes === "string" ? value.notes.normalize("NFC").trim() : "";
  if (notes.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)) {
    throw new Error("Invalid import notes");
  }

  const modelSlug = slugify(model);
  if (!modelSlug) throw new Error("Invalid import model slug");
  const created = new Date(parsedCreatedAt);
  const date = created.toISOString().slice(0, 10);
  const timestamp = created.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  return {
    task,
    model,
    harness: "lmarena",
    createdAt: value.createdAt,
    notes,
    modelSlug,
    appSlug: `${date}-lmarena-${modelSlug}`,
    runId: `${timestamp}-${modelSlug}-lmarena`
  };
}

function verifyReceipts(
  tokens: string[],
  draftId: string,
  secret: string,
  now: number
): FileReceiptPayload[] {
  if (!draftIdPattern.test(draftId)) throw new Error("Invalid import draft");
  if (!Array.isArray(tokens) || tokens.length === 0) throw new Error("Import receipts are required");
  if (tokens.length > IMPORT_LIMITS.fileCount) throw new Error("Import exceeds the 1,000 file limit");

  const receipts = tokens.map((token) => {
    if (typeof token !== "string") throw new Error("Invalid import file receipt");
    const receipt = verifyFileReceipt(token, secret, draftId, now);
    if (!receipt) throw new Error("Invalid or expired import file receipt");
    return receipt;
  });

  const paths = new Set<string>();
  let expandedBytes = 0;
  for (const receipt of receipts) {
    const pathKey = importPathKey(receipt.path);
    if (paths.has(pathKey)) throw new Error("Duplicate import receipt path");
    paths.add(pathKey);
    expandedBytes += receipt.size;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > IMPORT_LIMITS.expandedBytes) {
      throw new Error("Import exceeds the 75 MB expanded limit");
    }
  }

  if (!paths.has(importPathKey("index.html"))) throw new Error("Import has no supported project entry");
  const hasPackage = paths.has(importPathKey("package.json"));
  const hasViteEntry = paths.has(importPathKey("src/main.tsx"));
  if (hasPackage !== hasViteEntry) throw new Error("Import has an incomplete Vite entry");
  return receipts;
}

function assertNoImmutableCollision(
  existing: Array<{ path: string; type: string }>,
  candidatePaths: string[],
  reservedRoots: string[]
): void {
  const existingEntries = existing.map((entry) => ({
    path: entry.path.normalize("NFC").toLocaleLowerCase("en-US"),
    type: entry.type
  }));
  const candidates = candidatePaths.map((path) => path.normalize("NFC").toLocaleLowerCase("en-US"));
  const roots = reservedRoots.map((path) => path.normalize("NFC").toLocaleLowerCase("en-US"));

  if (roots.some((root) => existingEntries.some((entry) => (
    entry.path === root || entry.path.startsWith(`${root}/`)
  )))) {
    throw new Error("Import path collision on immutable main content");
  }

  for (const candidate of candidates) {
    for (const entry of existingEntries) {
      const exactCollision = entry.path === candidate;
      const blobAncestor = candidate.startsWith(`${entry.path}/`) && entry.type !== "tree";
      const existingDescendant = entry.path.startsWith(`${candidate}/`);
      if (exactCollision || blobAncestor || existingDescendant) {
        throw new Error("Import path collision on immutable main content");
      }
    }
  }
}

function belongsToDraft(branch: string, draftId: string): boolean {
  const match = staleBranchPattern.exec(branch);
  return match?.[2] === draftId;
}

function metadataBytes(metadata: NormalizedDraftMetadata): Uint8Array {
  const value = {
    run_id: metadata.runId,
    task: metadata.task,
    model: metadata.model,
    harness: metadata.harness,
    status: "success",
    app_name: metadata.appSlug,
    type: "web-app",
    created_at: metadata.createdAt,
    ...(metadata.notes ? { notes: metadata.notes } : {})
  };
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

export async function cleanupStaleDrafts(writer: BenchmarkGitWriter, now = Date.now()): Promise<void> {
  const threshold = requiredNow(now) - IMPORT_TOKEN_TTL_MS;
  let branches: string[];
  try {
    branches = await writer.listBranches("imports/");
  } catch {
    return;
  }
  const stale = branches.filter((branch) => {
    const match = staleBranchPattern.exec(branch);
    if (!match) return false;
    const createdAt = Number(match[1]) * 1_000;
    return Number.isSafeInteger(createdAt) && createdAt <= threshold;
  });
  await Promise.allSettled(stale.map((branch) => writer.deleteBranch(branch)));
}

export async function beginDraft(
  writer: BenchmarkGitWriter,
  secret: string,
  options: BeginDraftOptions = {}
): Promise<{ draftId: string; uploadToken: string }> {
  const now = requiredNow(options.now ?? Date.now());
  try {
    await cleanupStaleDrafts(writer, now);
  } catch {
    // Cleanup is opportunistic. A transient list failure must not block a new import.
  }
  const draftId = createDraftId(options.random ?? randomBytes(16));
  return {
    draftId,
    uploadToken: signUploadToken({
      version: 1,
      draftId,
      expiresAt: now + IMPORT_TOKEN_TTL_MS
    }, secret)
  };
}

export async function finalizeDraft(
  input: FinalizeDraftInput,
  writer: BenchmarkGitWriter,
  secret: string,
  options: ClockOptions = {}
): Promise<{
  draftId: string;
  branch: string;
  commitSha: string;
  task: string;
  appSlug: string;
  runId: string;
  draftToken: string;
  previewUrl: string;
}> {
  const now = requiredNow(options.now ?? Date.now());
  const metadata = normalizeMetadata(input.metadata);
  const receipts = verifyReceipts(input.receipts, input.draftId, secret, now);
  const artifactRoot = `benchmarks/${metadata.task}/${metadata.appSlug}`;
  const runRoot = `runs/${metadata.runId}`;
  const metadataPath = `${runRoot}/data/${metadata.task}/metadata.json`;
  const artifactEntries: GitTreeEntry[] = receipts.map((receipt) => ({
    path: `${artifactRoot}/${receipt.path}`,
    mode: "100644",
    type: "blob",
    sha: receipt.blobSha
  }));

  const importBranches = await writer.listBranches("imports/");
  if (importBranches.some((branch) => belongsToDraft(branch, input.draftId))) {
    throw new Error("Import draft was already finalized");
  }

  const mainHead = await writer.getHead("main");
  const existing = await writer.listTree(mainHead.commitSha);
  assertNoImmutableCollision(
    existing,
    [...artifactEntries.map((entry) => entry.path), metadataPath],
    [artifactRoot, runRoot]
  );

  const metadataSha = await writer.createBlob(metadataBytes(metadata));
  const entries: GitTreeEntry[] = [
    ...artifactEntries,
    { path: metadataPath, mode: "100644", type: "blob", sha: metadataSha }
  ];
  const treeSha = await writer.createTree(mainHead.treeSha, entries);
  const commitSha = await writer.createCommit(
    `Preview LM Arena import ${metadata.runId}`,
    treeSha,
    mainHead.commitSha
  );
  const receiptAuthorityExpiresAt = Math.min(...receipts.map((receipt) => receipt.expiresAt));
  const draftCreatedAt = receiptAuthorityExpiresAt - IMPORT_TOKEN_TTL_MS;
  const branch = `imports/${Math.ceil(draftCreatedAt / 1_000)}-${input.draftId}`;
  await writer.createBranch(branch, commitSha);

  const draftToken = signDraftToken({
    version: 1,
    draftId: input.draftId,
    branch,
    commitSha,
    task: metadata.task,
    appSlug: metadata.appSlug,
    runId: metadata.runId,
    expiresAt: Math.min(receiptAuthorityExpiresAt, now + IMPORT_TOKEN_TTL_MS)
  }, secret);
  return {
    draftId: input.draftId,
    branch,
    commitSha,
    task: metadata.task,
    appSlug: metadata.appSlug,
    runId: metadata.runId,
    draftToken,
    previewUrl: `/api/admin/imports/${input.draftId}/visual?token=${encodeURIComponent(draftToken)}`
  };
}
