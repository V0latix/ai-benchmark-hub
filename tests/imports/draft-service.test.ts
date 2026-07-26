import { describe, expect, it } from "vitest";

import { InMemoryGitWriter } from "../fixtures/in-memory-git-writer";
import {
  beginDraft,
  cleanupStaleDrafts,
  finalizeDraft
} from "../../src/lib/imports/draft-service";
import {
  IMPORT_TOKEN_TTL_MS,
  signFileReceipt,
  verifyDraftToken,
  verifyUploadToken,
  type FileReceiptPayload
} from "../../src/lib/imports/receipts";

const NOW = 1_785_072_000_000;
const SECRET = "test-signing-secret";
const DRAFT_ID = "0123456789abcdef0123456789abcdef";

const metadata = {
  task: "gmail-clone",
  model: " Model A ",
  harness: "lmarena" as const,
  createdAt: "2026-07-26T12:00:00.000Z",
  notes: "  reviewed in preview  "
};

function receipt(overrides: Partial<FileReceiptPayload> = {}) {
  return signFileReceipt({
    version: 1,
    draftId: DRAFT_ID,
    path: "index.html",
    blobSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    size: 13,
    contentType: "text/html; charset=utf-8",
    expiresAt: NOW + IMPORT_TOKEN_TTL_MS,
    ...overrides
  }, SECRET);
}

describe("import draft service", () => {
  it("assembles only verified blobs plus normalized metadata into a new unpredictable draft branch", async () => {
    const writer = new InMemoryGitWriter();

    const result = await finalizeDraft(
      { metadata, receipts: [receipt()], draftId: DRAFT_ID },
      writer,
      SECRET,
      { now: NOW }
    );

    expect(result).toMatchObject({
      draftId: DRAFT_ID,
      branch: `imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`,
      appSlug: "2026-07-26-lmarena-model-a",
      runId: "20260726T120000Z-model-a-lmarena"
    });
    expect(result.previewUrl).toBe(`/api/admin/imports/${DRAFT_ID}/visual?token=${encodeURIComponent(result.draftToken)}`);
    expect(writer.createdTreeEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "benchmarks/gmail-clone/2026-07-26-lmarena-model-a/index.html",
        sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }),
      expect.objectContaining({
        path: "runs/20260726T120000Z-model-a-lmarena/data/gmail-clone/metadata.json"
      })
    ]));

    const metadataEntry = writer.createdTreeEntries.find((entry) => entry.path.endsWith("/metadata.json"));
    const metadataBytes = metadataEntry && writer.blobs.get(metadataEntry.sha);
    expect(JSON.parse(new TextDecoder().decode(metadataBytes))).toEqual({
      run_id: "20260726T120000Z-model-a-lmarena",
      task: "gmail-clone",
      model: "Model A",
      harness: "lmarena",
      status: "success",
      app_name: "2026-07-26-lmarena-model-a",
      type: "web-app",
      created_at: "2026-07-26T12:00:00.000Z",
      notes: "reviewed in preview"
    });
    expect(verifyDraftToken(result.draftToken, SECRET, DRAFT_ID, NOW)).toMatchObject({
      branch: result.branch,
      commitSha: result.commitSha,
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    });
  });

  it("rejects invalid, cross-draft, duplicate, excessive, and entry-less receipt sets before writing", async () => {
    const cases: Array<{ name: string; receipts: string[]; pattern: RegExp }> = [
      { name: "tampered", receipts: [`${receipt()}x`], pattern: /receipt/i },
      {
        name: "cross-draft",
        receipts: [receipt({ draftId: "fedcba9876543210fedcba9876543210" })],
        pattern: /receipt/i
      },
      {
        name: "case-folded duplicate",
        receipts: [receipt(), receipt({ path: "INDEX.html", blobSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" })],
        pattern: /duplicate/i
      },
      {
        name: "expanded bytes",
        receipts: Array.from({ length: 26 }, (_, index) => receipt({
          path: index === 0 ? "index.html" : `assets/${index}.js`,
          blobSha: index.toString(16).padStart(40, "0"),
          size: 3_000_000
        })),
        pattern: /75 MB/i
      },
      {
        name: "file count",
        receipts: Array.from({ length: 1_001 }, () => receipt()),
        pattern: /1,000 file/i
      },
      {
        name: "missing entry",
        receipts: [receipt({ path: "assets/app.js" })],
        pattern: /entry/i
      }
    ];

    for (const testCase of cases) {
      const writer = new InMemoryGitWriter();
      await expect(finalizeDraft(
        { metadata, receipts: testCase.receipts, draftId: DRAFT_ID },
        writer,
        SECRET,
        { now: NOW }
      ), testCase.name).rejects.toThrow(testCase.pattern);
      expect(writer.commits, testCase.name).toHaveLength(0);
      expect(writer.refs.has(`imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`), testCase.name).toBe(false);
    }
  });

  it("requires the complete supported Vite entry path set when source entry files are present", async () => {
    const complete = [
      receipt(),
      receipt({ path: "package.json", blobSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
      receipt({ path: "src/main.tsx", blobSha: "cccccccccccccccccccccccccccccccccccccccc" })
    ];
    const result = await finalizeDraft(
      { metadata, receipts: complete, draftId: DRAFT_ID },
      new InMemoryGitWriter(),
      SECRET,
      { now: NOW }
    );
    expect(result.appSlug).toBe("2026-07-26-lmarena-model-a");

    await expect(finalizeDraft(
      { metadata, receipts: complete.slice(0, 2), draftId: DRAFT_ID },
      new InMemoryGitWriter(),
      SECRET,
      { now: NOW }
    )).rejects.toThrow(/Vite entry/i);
  });

  it("rejects an existing run or application root on main instead of replacing immutable paths", async () => {
    for (const existingPath of [
      "benchmarks/gmail-clone/2026-07-26-lmarena-model-a/old.js",
      "runs/20260726T120000Z-model-a-lmarena/data/other/metadata.json",
      "BENCHMARKS/GMAIL-CLONE/2026-07-26-LMARENA-MODEL-A/index.html"
    ]) {
      const writer = new InMemoryGitWriter();
      writer.treeEntries.set("main-commit", [{ path: existingPath, type: "blob", sha: "d".repeat(40) }]);

      await expect(finalizeDraft(
        { metadata, receipts: [receipt()], draftId: DRAFT_ID },
        writer,
        SECRET,
        { now: NOW }
      )).rejects.toThrow(/collision/i);
      expect(writer.createdTreeEntries).toHaveLength(0);
      expect(writer.commits).toHaveLength(0);
    }
  });

  it("checks collisions on the exact main commit used as the draft parent", async () => {
    const writer = new InMemoryGitWriter();
    writer.treeEntries.set("main-commit", [{
      path: "benchmarks/gmail-clone/2026-07-26-lmarena-model-a/index.html",
      type: "blob",
      sha: "d".repeat(40)
    }]);

    await expect(finalizeDraft(
      { metadata, receipts: [receipt()], draftId: DRAFT_ID },
      writer,
      SECRET,
      { now: NOW }
    )).rejects.toThrow(/collision/i);
    expect(writer.commits).toHaveLength(0);
  });

  it("creates upload authority from 128 injected random bits and treats stale cleanup as best effort", async () => {
    class BrokenCleanupWriter extends InMemoryGitWriter {
      override async listBranches(): Promise<string[]> {
        throw new Error("temporary GitHub outage");
      }
    }
    const writer = new BrokenCleanupWriter();

    await expect(cleanupStaleDrafts(writer, NOW)).resolves.toBeUndefined();
    const result = await beginDraft(writer, SECRET, {
      now: NOW,
      random: new Uint8Array(16).fill(0xab)
    });

    expect(result.draftId).toBe("abababababababababababababababab");
    expect(verifyUploadToken(result.uploadToken, SECRET, NOW)).toEqual({
      version: 1,
      draftId: result.draftId,
      expiresAt: NOW + IMPORT_TOKEN_TTL_MS
    });
  });

  it("deletes only timestamped import branches older than 24 hours and continues after a deletion error", async () => {
    class PartlyBrokenWriter extends InMemoryGitWriter {
      readonly attempted: string[] = [];

      override async deleteBranch(branch: string): Promise<void> {
        this.attempted.push(branch);
        if (branch.includes("111111")) throw new Error("delete failed");
        await super.deleteBranch(branch);
      }
    }
    const writer = new PartlyBrokenWriter();
    const staleTimestamp = Math.floor((NOW - IMPORT_TOKEN_TTL_MS - 1) / 1_000);
    const recentTimestamp = Math.floor((NOW - IMPORT_TOKEN_TTL_MS + 60_000) / 1_000);
    const staleA = `imports/${staleTimestamp}-${"1".repeat(32)}`;
    const staleB = `imports/${staleTimestamp}-${"2".repeat(32)}`;
    const recent = `imports/${recentTimestamp}-${"3".repeat(32)}`;
    const malformed = `imports/not-a-time-${"4".repeat(32)}`;
    writer.refs.set(staleA, "main-commit");
    writer.refs.set(staleB, "main-commit");
    writer.refs.set(recent, "main-commit");
    writer.refs.set(malformed, "main-commit");

    await cleanupStaleDrafts(writer, NOW);

    expect(writer.attempted).toEqual([staleA, staleB]);
    expect(writer.refs.has(staleA)).toBe(true);
    expect(writer.refs.has(staleB)).toBe(false);
    expect(writer.refs.has(recent)).toBe(true);
    expect(writer.refs.has(malformed)).toBe(true);
  });
});
