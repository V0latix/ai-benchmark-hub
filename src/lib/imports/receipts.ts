import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { normalizeImportPath } from "./policy";
import { IMPORT_LIMITS } from "./types";

const SIGNATURE_BYTES = 32;
const PURPOSE = {
  draft: "import-draft",
  file: "import-file",
  preview: "import-preview",
  upload: "import-upload"
} as const;
const draftIdPattern = /^[a-f0-9]{32,}$/;
const gitShaPattern = /^[a-f0-9]{40}$/;
const branchPattern = /^imports\/[0-9]{10,}-[a-f0-9]{32,}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const IMPORT_TOKEN_TTL_MS = 24 * 60 * 60 * 1_000;
export const PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1_000;

export type UploadTokenPayload = {
  version: 1;
  draftId: string;
  expiresAt: number;
};

export type FileReceiptPayload = {
  version: 1;
  draftId: string;
  path: string;
  blobSha: string;
  size: number;
  contentType: string;
  expiresAt: number;
};

export type DraftTokenPayload = {
  version: 1;
  draftId: string;
  branch: string;
  commitSha: string;
  task: string;
  appSlug: string;
  runId: string;
  expiresAt: number;
};

export type PreviewTokenPayload = {
  version: 1;
  draftId: string;
  branch: string;
  commitSha: string;
  task: string;
  appSlug: string;
  nonce: string;
  expiresAt: number;
};

export type PreviewTokenBinding = Pick<
  PreviewTokenPayload,
  "draftId" | "branch" | "commitSha" | "task" | "appSlug" | "nonce"
>;

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isSafeExpiry(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isUploadTokenPayload(value: unknown): value is UploadTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<UploadTokenPayload>;
  return hasExactKeys(value, ["version", "draftId", "expiresAt"])
    && payload.version === 1
    && typeof payload.draftId === "string"
    && draftIdPattern.test(payload.draftId)
    && isSafeExpiry(payload.expiresAt);
}

function isFileReceiptPayload(value: unknown): value is FileReceiptPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<FileReceiptPayload>;
  if (
    !hasExactKeys(value, ["version", "draftId", "path", "blobSha", "size", "contentType", "expiresAt"])
    || payload.version !== 1
    || typeof payload.draftId !== "string"
    || !draftIdPattern.test(payload.draftId)
    || typeof payload.path !== "string"
    || typeof payload.blobSha !== "string"
    || !gitShaPattern.test(payload.blobSha)
    || typeof payload.size !== "number"
    || !Number.isSafeInteger(payload.size)
    || payload.size < 0
    || payload.size > IMPORT_LIMITS.fileBytes
    || typeof payload.contentType !== "string"
    || payload.contentType.length === 0
    || payload.contentType.length > 255
    || !isSafeExpiry(payload.expiresAt)
  ) {
    return false;
  }

  try {
    return normalizeImportPath(payload.path) === payload.path;
  } catch {
    return false;
  }
}

function isDraftTokenPayload(value: unknown): value is DraftTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DraftTokenPayload>;
  return hasExactKeys(value, ["version", "draftId", "branch", "commitSha", "task", "appSlug", "runId", "expiresAt"])
    && payload.version === 1
    && typeof payload.draftId === "string"
    && draftIdPattern.test(payload.draftId)
    && typeof payload.branch === "string"
    && branchPattern.test(payload.branch)
    && payload.branch.endsWith(`-${payload.draftId}`)
    && typeof payload.commitSha === "string"
    && gitShaPattern.test(payload.commitSha)
    && typeof payload.task === "string"
    && slugPattern.test(payload.task)
    && typeof payload.appSlug === "string"
    && slugPattern.test(payload.appSlug)
    && typeof payload.runId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(payload.runId)
    && isSafeExpiry(payload.expiresAt);
}

function isPreviewTokenPayload(value: unknown): value is PreviewTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<PreviewTokenPayload>;
  return hasExactKeys(value, ["version", "draftId", "branch", "commitSha", "task", "appSlug", "nonce", "expiresAt"])
    && payload.version === 1
    && typeof payload.draftId === "string"
    && draftIdPattern.test(payload.draftId)
    && typeof payload.branch === "string"
    && branchPattern.test(payload.branch)
    && payload.branch.endsWith(`-${payload.draftId}`)
    && typeof payload.commitSha === "string"
    && gitShaPattern.test(payload.commitSha)
    && typeof payload.task === "string"
    && slugPattern.test(payload.task)
    && typeof payload.appSlug === "string"
    && slugPattern.test(payload.appSlug)
    && typeof payload.nonce === "string"
    && /^[a-f0-9]{32,}$/.test(payload.nonce)
    && isSafeExpiry(payload.expiresAt);
}

function canonicalUploadToken(payload: UploadTokenPayload): UploadTokenPayload {
  return { version: 1, draftId: payload.draftId, expiresAt: payload.expiresAt };
}

function canonicalFileReceipt(payload: FileReceiptPayload): FileReceiptPayload {
  return {
    version: 1,
    draftId: payload.draftId,
    path: payload.path,
    blobSha: payload.blobSha,
    size: payload.size,
    contentType: payload.contentType,
    expiresAt: payload.expiresAt
  };
}

function canonicalDraftToken(payload: DraftTokenPayload): DraftTokenPayload {
  return {
    version: 1,
    draftId: payload.draftId,
    branch: payload.branch,
    commitSha: payload.commitSha,
    task: payload.task,
    appSlug: payload.appSlug,
    runId: payload.runId,
    expiresAt: payload.expiresAt
  };
}

function canonicalPreviewToken(payload: PreviewTokenPayload): PreviewTokenPayload {
  return {
    version: 1,
    draftId: payload.draftId,
    branch: payload.branch,
    commitSha: payload.commitSha,
    task: payload.task,
    appSlug: payload.appSlug,
    nonce: payload.nonce,
    expiresAt: payload.expiresAt
  };
}

function signature(purpose: string, encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${purpose}.${encodedPayload}`).digest();
}

function sign<T extends object>(purpose: string, payload: T, secret: string): string {
  if (!secret) throw new Error("Import signing secret must not be empty");
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(purpose, encodedPayload, secret).toString("base64url")}`;
}

function decodeBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function verify<T>(
  token: string,
  purpose: string,
  secret: string,
  guard: (value: unknown) => value is T
): T | null {
  if (typeof token !== "string" || !secret) return null;
  const [encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra.length) return null;

  const payloadBytes = decodeBase64Url(encodedPayload);
  const suppliedSignature = decodeBase64Url(encodedSignature);
  if (!payloadBytes || suppliedSignature?.byteLength !== SIGNATURE_BYTES) return null;
  if (!timingSafeEqual(signature(purpose, encodedPayload, secret), suppliedSignature)) return null;

  try {
    const parsed: unknown = JSON.parse(payloadBytes.toString("utf8"));
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createDraftId(random: Uint8Array = randomBytes(16)): string {
  if (random.byteLength < 16) throw new Error("Draft IDs require at least 128 random bits");
  return Buffer.from(random).toString("hex");
}

export function createPreviewNonce(random: Uint8Array = randomBytes(16)): string {
  if (random.byteLength < 16) throw new Error("Preview nonces require at least 128 random bits");
  return Buffer.from(random).toString("hex");
}

export function signUploadToken(payload: UploadTokenPayload, secret: string): string {
  if (!isUploadTokenPayload(payload)) throw new Error("Invalid upload token payload");
  return sign(PURPOSE.upload, canonicalUploadToken(payload), secret);
}

export function verifyUploadToken(token: string, secret: string, now = Date.now()): UploadTokenPayload | null {
  const payload = verify(token, PURPOSE.upload, secret, isUploadTokenPayload);
  return payload && payload.expiresAt > now ? payload : null;
}

export function signFileReceipt(payload: FileReceiptPayload, secret: string): string {
  if (!isFileReceiptPayload(payload)) throw new Error("Invalid file receipt payload");
  return sign(PURPOSE.file, canonicalFileReceipt(payload), secret);
}

export function verifyFileReceipt(
  token: string,
  secret: string,
  expectedDraftId: string,
  now = Date.now()
): FileReceiptPayload | null {
  const payload = verify(token, PURPOSE.file, secret, isFileReceiptPayload);
  return payload && payload.draftId === expectedDraftId && payload.expiresAt > now ? payload : null;
}

export function signDraftToken(payload: DraftTokenPayload, secret: string): string {
  if (!isDraftTokenPayload(payload)) throw new Error("Invalid draft token payload");
  return sign(PURPOSE.draft, canonicalDraftToken(payload), secret);
}

export function verifyDraftToken(
  token: string,
  secret: string,
  expectedDraftId: string,
  now = Date.now()
): DraftTokenPayload | null {
  const payload = verify(token, PURPOSE.draft, secret, isDraftTokenPayload);
  return payload && payload.draftId === expectedDraftId && payload.expiresAt > now ? payload : null;
}

export function signPreviewToken(payload: PreviewTokenPayload, secret: string): string {
  if (!isPreviewTokenPayload(payload)) throw new Error("Invalid preview token payload");
  return sign(PURPOSE.preview, canonicalPreviewToken(payload), secret);
}

export function verifyPreviewToken(
  token: string,
  secret: string,
  expected: PreviewTokenBinding,
  now = Date.now()
): PreviewTokenPayload | null {
  const payload = verify(token, PURPOSE.preview, secret, isPreviewTokenPayload);
  return payload
    && payload.draftId === expected.draftId
    && payload.branch === expected.branch
    && payload.commitSha === expected.commitSha
    && payload.task === expected.task
    && payload.appSlug === expected.appSlug
    && payload.nonce === expected.nonce
    && payload.expiresAt > now
    && payload.expiresAt <= now + PREVIEW_TOKEN_TTL_MS
    ? payload
    : null;
}

export function verifyPreviewTokenForDraft(token: string, secret: string, draftId: string, now = Date.now()): PreviewTokenPayload | null {
  const payload = verify(token, PURPOSE.preview, secret, isPreviewTokenPayload);
  return payload
    && payload.draftId === draftId
    && payload.expiresAt > now
    && payload.expiresAt <= now + PREVIEW_TOKEN_TTL_MS
    ? payload
    : null;
}
