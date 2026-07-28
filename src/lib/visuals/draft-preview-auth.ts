import "server-only";

import type { BenchmarkGitWriter } from "../github/write-client";
import {
  PREVIEW_TOKEN_TTL_MS,
  verifyPreviewTokenForDraft,
  type PreviewTokenPayload
} from "../imports/receipts";

export const adminPreviewCookieName = "__Secure-benchmark_preview";

export function getAdminPreviewCorsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== "null") return null;
  return origin === "null"
    ? {
        "Access-Control-Allow-Origin": "null",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin"
      }
    : { "Vary": "Origin" };
}

export function adminPreviewCookiePath(draftId: string): string {
  if (!/^[a-f0-9]{32,}$/.test(draftId)) throw new Error("Invalid preview draft");
  return `/api/admin/imports/${draftId}/visual`;
}

export function readAdminPreviewCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  let found: string | null = null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0 || pair.slice(0, separator).trim() !== adminPreviewCookieName) continue;
    if (found !== null) return null;
    const value = pair.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
    found = value;
  }
  return found;
}

export function serializeAdminPreviewCookie(
  token: string,
  preview: PreviewTokenPayload,
  draftId: string,
  now = Date.now()
): string {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error("Invalid preview token");
  const secondsRemaining = Math.floor((preview.expiresAt - now) / 1_000);
  const maxAge = Math.min(Math.floor(PREVIEW_TOKEN_TTL_MS / 1_000), secondsRemaining);
  if (maxAge <= 0) throw new Error("Expired preview token");
  return [
    `${adminPreviewCookieName}=${token}`,
    `Max-Age=${maxAge}`,
    `Path=${adminPreviewCookiePath(draftId)}`,
    "HttpOnly",
    "SameSite=None",
    "Secure"
  ].join("; ");
}

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

export async function verifyLiveDraftPreviewRequest(
  request: Request,
  secret: string,
  draftId: string,
  writer: BenchmarkGitWriter,
  now = Date.now()
): Promise<PreviewTokenPayload | null> {
  const token = readAdminPreviewCookie(request);
  return token ? verifyLiveDraftPreview(token, secret, draftId, writer, now) : null;
}
