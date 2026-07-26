import { describe, expect, it } from "vitest";

import {
  createDraftId,
  signDraftToken,
  signFileReceipt,
  signUploadToken,
  verifyDraftToken,
  verifyFileReceipt,
  verifyUploadToken,
  type DraftTokenPayload,
  type FileReceiptPayload
} from "../../src/lib/imports/receipts";

const NOW = 1_785_072_000_000;
const SECRET = "test-signing-secret";

const fileReceipt: FileReceiptPayload = {
  version: 1,
  draftId: "0123456789abcdef0123456789abcdef",
  path: "index.html",
  blobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  size: 13,
  contentType: "text/html; charset=utf-8",
  expiresAt: NOW + 60_000
};

const draftToken: DraftTokenPayload = {
  version: 1,
  draftId: fileReceipt.draftId,
  branch: `imports/${Math.floor(NOW / 1_000)}-${fileReceipt.draftId}`,
  commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  task: "gmail-clone",
  appSlug: "2026-07-26-lmarena-model-a",
  runId: "20260726T120000Z-model-a-lmarena",
  expiresAt: NOW + 60_000
};

describe("import receipts", () => {
  it("rejects tampering, expiration, malformed envelopes, and a receipt from another draft", () => {
    const receipt = signFileReceipt(fileReceipt, SECRET);

    expect(verifyFileReceipt(receipt, SECRET, fileReceipt.draftId, NOW)).toEqual(fileReceipt);
    expect(verifyFileReceipt(`${receipt}x`, SECRET, fileReceipt.draftId, NOW)).toBeNull();
    expect(verifyFileReceipt(receipt, SECRET, "fedcba9876543210fedcba9876543210", NOW)).toBeNull();
    expect(verifyFileReceipt(receipt, SECRET, fileReceipt.draftId, fileReceipt.expiresAt)).toBeNull();
    expect(verifyFileReceipt(`${receipt}.extra`, SECRET, fileReceipt.draftId, NOW)).toBeNull();
    expect(verifyFileReceipt(null as unknown as string, SECRET, fileReceipt.draftId, NOW)).toBeNull();
  });

  it("uses canonical payloads and separate HMAC purposes for upload, file, and read-only draft tokens", () => {
    const reorderedReceipt = {
      expiresAt: fileReceipt.expiresAt,
      contentType: fileReceipt.contentType,
      size: fileReceipt.size,
      blobSha: fileReceipt.blobSha,
      path: fileReceipt.path,
      draftId: fileReceipt.draftId,
      version: 1 as const
    };
    const receipt = signFileReceipt(fileReceipt, SECRET);

    expect(signFileReceipt(reorderedReceipt, SECRET)).toBe(receipt);
    expect(verifyUploadToken(receipt, SECRET, NOW)).toBeNull();
    expect(verifyDraftToken(receipt, SECRET, fileReceipt.draftId, NOW)).toBeNull();

    const upload = signUploadToken({
      version: 1,
      draftId: fileReceipt.draftId,
      expiresAt: fileReceipt.expiresAt
    }, SECRET);
    expect(verifyUploadToken(upload, SECRET, NOW)).toEqual({
      version: 1,
      draftId: fileReceipt.draftId,
      expiresAt: fileReceipt.expiresAt
    });
    expect(verifyFileReceipt(upload, SECRET, fileReceipt.draftId, NOW)).toBeNull();

    const readOnlyDraft = signDraftToken(draftToken, SECRET);
    expect(verifyDraftToken(readOnlyDraft, SECRET, draftToken.draftId, NOW)).toEqual(draftToken);
    expect(verifyUploadToken(readOnlyDraft, SECRET, NOW)).toBeNull();
  });

  it("strictly validates signed payload schemas instead of trusting valid signatures", () => {
    expect(() => signFileReceipt({ ...fileReceipt, blobSha: "not-a-sha" }, SECRET)).toThrow(/receipt/i);
    expect(() => signFileReceipt({ ...fileReceipt, size: 3_000_001 }, SECRET)).toThrow(/receipt/i);
    expect(() => signDraftToken({ ...draftToken, branch: "main" }, SECRET)).toThrow(/draft/i);
    expect(() => signUploadToken({
      version: 1,
      draftId: fileReceipt.draftId,
      expiresAt: Number.NaN
    }, SECRET)).toThrow(/upload/i);
  });

  it("creates a lowercase URL-safe draft identifier with at least 128 random bits", () => {
    const first = createDraftId(new Uint8Array(16).fill(0xab));
    const second = createDraftId(new Uint8Array(16).fill(0xcd));

    expect(first).toBe("abababababababababababababababab");
    expect(second).toBe("cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-z0-9_-]{32,}$/);
    expect(() => createDraftId(new Uint8Array(15))).toThrow(/128/i);
  });
});
