import { describe, expect, it } from "vitest";

import { signDraftToken, signPreviewToken, verifyPreviewToken } from "../../src/lib/imports/receipts";
import { resolveDraftPreviewContext } from "../../src/lib/visuals/preview-context";

const secret = "test-signing-secret";
const draftId = "4f3a2d1c4b5e6f708192a3b4c5d6e7f8";
const commitSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("draft preview context", () => {
  it("pins a draft preview to the signed immutable commit and derived artifact directory", async () => {
    const token = signDraftToken({
      version: 1,
      draftId,
      branch: `imports/1785072000-${draftId}`,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      runId: "20260726T120000Z-model-a-lmarena",
      expiresAt: 1_785_158_400_000
    }, secret);

    const context = await resolveDraftPreviewContext({
      draftId,
      token,
      requestedPath: "../../runs/another-run/data/secret.json"
    }, { secret, now: 1_785_072_000_000 });

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
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a",
      expiresAt: 1_785_072_300_000
    }, secret);

    expect(verifyPreviewToken(token, secret, {
      draftId,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a"
    }, 1_785_072_000_000)).not.toBeNull();
    expect(verifyPreviewToken(token, secret, {
      draftId,
      commitSha,
      task: "gmail-clone",
      appSlug: "another-app"
    }, 1_785_072_000_000)).toBeNull();
    expect(verifyPreviewToken(token, secret, {
      draftId,
      commitSha,
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a"
    }, 1_785_072_300_000)).toBeNull();
  });
});
