import { describe, expect, it } from "vitest";

import { signPreviewToken, verifyPreviewToken } from "../../src/lib/imports/receipts";
import { resolveVerifiedDraftPreviewContext } from "../../src/lib/visuals/preview-context";

const secret = "test-signing-secret";
const draftId = "4f3a2d1c4b5e6f708192a3b4c5d6e7f8";
const commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const branch = `imports/1785072000-${draftId}`;
const nonce = "cd".repeat(16);

describe("draft preview context", () => {
  it("pins a draft preview to the short-lived immutable binding and derived artifact directory", () => {
    const token = signPreviewToken({
      version: 1,
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      nonce,
      expiresAt: 1_785_158_400_000
    }, secret);
    const binding = verifyPreviewToken(token, secret, {
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      nonce
    }, 1_785_158_100_001);
    const context = resolveVerifiedDraftPreviewContext(binding!);

    expect(context.ref).toBe(commitSha);
    expect(context.artifactDirectory).toBe("benchmarks/gmail-clone/2026-07-26-lmarena-model-a");
    expect(context.entryPath).toBe("benchmarks/gmail-clone/2026-07-26-lmarena-model-a/index.html");
    expect(context.source.branch).toBe(commitSha);
    expect(context.source.allowlist).toEqual(["benchmarks/gmail-clone/2026-07-26-lmarena-model-a/**"]);
  });

  it("authorizes a subresource only for the signed draft artifact and a short expiry", () => {
    const token = signPreviewToken({
      version: 1,
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      nonce,
      expiresAt: 1_785_072_300_000
    }, secret);

    expect(verifyPreviewToken(token, secret, {
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      nonce
    }, 1_785_072_000_000)).not.toBeNull();
    expect(verifyPreviewToken(token, secret, {
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "another-app",
      nonce
    }, 1_785_072_000_000)).toBeNull();
    expect(verifyPreviewToken(token, secret, {
      draftId,
      branch,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      nonce
    }, 1_785_072_300_000)).toBeNull();
  });
});
