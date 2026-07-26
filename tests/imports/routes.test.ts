import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../src/lib/admin/auth";
import type { AdminEnvironment } from "../../src/lib/admin/env";
import { createBeginImportHandler } from "../../src/app/api/admin/imports/route";
import { createUploadImportFileHandler } from "../../src/app/api/admin/imports/files/route";
import { createFinalizeImportHandler } from "../../src/app/api/admin/imports/finalize/route";
import {
  IMPORT_TOKEN_TTL_MS,
  signFileReceipt,
  signUploadToken,
  verifyDraftToken,
  verifyFileReceipt
} from "../../src/lib/imports/receipts";
import { InMemoryGitWriter } from "../fixtures/in-memory-git-writer";

const NOW = 1_785_072_000_000;
const CSRF = "route-csrf";
const SECRET = "route-signing-secret-that-must-not-leak";
const DRAFT_ID = "abababababababababababababababab";
const env: AdminEnvironment = {
  passwordHash: "unused-in-protected-routes",
  sessionSecret: SECRET,
  githubToken: "fake-github-token-that-must-not-leak"
};

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    cookie: `benchmark_admin=${createAdminSession(SECRET, { csrf: CSRF })}`,
    origin: "https://hub.example",
    "x-csrf-token": CSRF,
    ...extra
  };
}

function routeDependencies(writer: InMemoryGitWriter) {
  return {
    readEnvironment: () => env,
    createWriter: () => writer,
    now: () => NOW
  };
}

function rawRequest(path: string, bytes: Uint8Array, headers: Record<string, string>) {
  return new Request(`https://hub.example${path}`, {
    method: "POST",
    headers,
    body: new Uint8Array(bytes).buffer
  });
}

describe("admin import routes", () => {
  it("protects begin with the admin session, same-origin, and per-session CSRF before creating a writer", async () => {
    const POST = createBeginImportHandler({
      readEnvironment: () => env,
      createWriter: () => {
        throw new Error("writer must not be created");
      },
      now: () => NOW,
      random: () => new Uint8Array(16).fill(0xab)
    });

    for (const headers of [
      {},
      { ...adminHeaders(), origin: "https://evil.example" },
      { ...adminHeaders(), "x-csrf-token": "wrong" }
    ]) {
      const response = await POST(new Request("https://hub.example/api/admin/imports", {
        method: "POST",
        headers
      }));
      expect(response.status).toBe(401);
    }
  });

  it("begins an unpredictable upload authority with injected dependencies and never exposes server secrets", async () => {
    const writer = new InMemoryGitWriter();
    const POST = createBeginImportHandler({
      ...routeDependencies(writer),
      random: () => new Uint8Array(16).fill(0xab)
    });

    const response = await POST(new Request("https://hub.example/api/admin/imports", {
      method: "POST",
      headers: adminHeaders()
    }));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.draftId).toBe(DRAFT_ID);
    expect(body.uploadToken).toEqual(expect.any(String));
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(env.githubToken);
  });

  it("uploads one exactly bounded raw body, validates path/type/bytes, and returns a verified receipt", async () => {
    const writer = new InMemoryGitWriter();
    const POST = createUploadImportFileHandler(routeDependencies(writer));
    const bytes = new TextEncoder().encode("<html></html>");
    const uploadToken = signUploadToken({
      version: 1,
      draftId: DRAFT_ID,
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    }, SECRET);

    const response = await POST(rawRequest("/api/admin/imports/files", bytes, adminHeaders({
      "content-length": String(bytes.byteLength),
      "content-type": "application/octet-stream",
      "x-import-upload-token": uploadToken,
      "x-import-path": encodeURIComponent("index.html"),
      "x-import-content-type": encodeURIComponent("text/html")
    })));
    const body = await response.json();
    const verified = verifyFileReceipt(body.receipt, SECRET, DRAFT_ID, NOW);

    expect(response.status).toBe(200);
    expect(verified).toEqual({
      version: 1,
      draftId: DRAFT_ID,
      path: "index.html",
      blobSha: expect.stringMatching(/^[a-f0-9]{40}$/),
      size: bytes.byteLength,
      contentType: "text/html; charset=utf-8",
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    });
    expect(writer.blobs.get(verified!.blobSha)).toEqual(bytes);
  });

  it("rejects missing, oversized, and dishonest raw body lengths without creating a blob", async () => {
    const uploadToken = signUploadToken({
      version: 1,
      draftId: DRAFT_ID,
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    }, SECRET);
    const base = {
      ...adminHeaders(),
      "content-type": "application/octet-stream",
      "x-import-upload-token": uploadToken,
      "x-import-path": encodeURIComponent("index.html"),
      "x-import-content-type": encodeURIComponent("text/html")
    };

    for (const length of [undefined, "3000001", "1"]) {
      const writer = new InMemoryGitWriter();
      const POST = createUploadImportFileHandler(routeDependencies(writer));
      const headers = { ...base, ...(length === undefined ? {} : { "content-length": length }) };
      const response = await POST(rawRequest(
        "/api/admin/imports/files",
        new TextEncoder().encode("<html></html>"),
        headers
      ));
      expect(response.status).toBe(length === "3000001" ? 413 : 400);
      expect(writer.blobs.size).toBe(0);
    }
  });

  it("rejects expired upload authority and unsafe content without reflecting private details", async () => {
    const cases = [
      {
        token: signUploadToken({ version: 1, draftId: DRAFT_ID, expiresAt: NOW }, SECRET),
        path: "index.html",
        type: "text/html",
        bytes: new TextEncoder().encode("<html></html>")
      },
      {
        token: signUploadToken({
          version: 1,
          draftId: DRAFT_ID,
          expiresAt: NOW + IMPORT_TOKEN_TTL_MS
        }, SECRET),
        path: "../private-key.pem",
        type: "text/html",
        bytes: new TextEncoder().encode("-----BEGIN PRIVATE KEY-----")
      }
    ];

    for (const testCase of cases) {
      const writer = new InMemoryGitWriter();
      const POST = createUploadImportFileHandler(routeDependencies(writer));
      const response = await POST(rawRequest("/api/admin/imports/files", testCase.bytes, adminHeaders({
        "content-length": String(testCase.bytes.byteLength),
        "content-type": "application/octet-stream",
        "x-import-upload-token": testCase.token,
        "x-import-path": encodeURIComponent(testCase.path),
        "x-import-content-type": encodeURIComponent(testCase.type)
      })));
      const text = await response.text();
      expect(response.status).toBe(400);
      expect(writer.blobs.size).toBe(0);
      expect(text).not.toContain("PRIVATE KEY");
      expect(text).not.toContain(SECRET);
    }
  });

  it("finalizes bounded JSON through the injected writer and returns only read-only preview authority", async () => {
    const writer = new InMemoryGitWriter();
    const POST = createFinalizeImportHandler(routeDependencies(writer));
    const receipt = signFileReceipt({
      version: 1,
      draftId: DRAFT_ID,
      path: "index.html",
      blobSha: "a".repeat(40),
      size: 13,
      contentType: "text/html; charset=utf-8",
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    }, SECRET);
    const payload = JSON.stringify({
      draftId: DRAFT_ID,
      receipts: [receipt],
      metadata: {
        task: "gmail-clone",
        model: "model-a",
        harness: "lmarena",
        createdAt: "2026-07-26T12:00:00.000Z",
        notes: ""
      }
    });
    const response = await POST(new Request("https://hub.example/api/admin/imports/finalize", {
      method: "POST",
      headers: adminHeaders({
        "content-length": String(Buffer.byteLength(payload)),
        "content-type": "application/json"
      }),
      body: payload
    }));
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["draftToken", "previewUrl"]);
    expect(verifyDraftToken(body.draftToken, SECRET, DRAFT_ID, NOW)).toMatchObject({
      task: "gmail-clone",
      appSlug: "2026-07-26-lmarena-model-a"
    });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(env.githubToken);
  });

  it("bounds finalize JSON below the platform body limit and authorizes before parsing", async () => {
    const POST = createFinalizeImportHandler({
      readEnvironment: () => env,
      createWriter: () => {
        throw new Error("writer must not be created");
      },
      now: () => NOW
    });
    const unauthorized = await POST(new Request("https://hub.example/api/admin/imports/finalize", {
      method: "POST",
      headers: { "content-length": "4000001" },
      body: "{}"
    }));
    expect(unauthorized.status).toBe(401);

    const writer = new InMemoryGitWriter();
    const boundedPOST = createFinalizeImportHandler(routeDependencies(writer));
    const oversized = await boundedPOST(new Request("https://hub.example/api/admin/imports/finalize", {
      method: "POST",
      headers: adminHeaders({ "content-length": "4000001" }),
      body: "{}"
    }));
    expect(oversized.status).toBe(413);
    expect(writer.commits).toHaveLength(0);
  });
});
