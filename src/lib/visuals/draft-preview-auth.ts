import "server-only";

import type { BenchmarkGitWriter } from "../github/write-client";
import {
  verifyPreviewTokenForDraft,
  type PreviewTokenPayload
} from "../imports/receipts";

export async function verifyLiveDraftPreview(
  token: string,
  secret: string,
  draftId: string,
  writer: BenchmarkGitWriter,
  now = Date.now()
): Promise<PreviewTokenPayload | null> {
  const preview = verifyPreviewTokenForDraft(token, secret, draftId, now);
  if (!preview) return null;

  try {
    const head = await writer.getHead(preview.branch);
    return head.commitSha === preview.commitSha ? preview : null;
  } catch {
    return null;
  }
}
