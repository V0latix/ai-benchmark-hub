import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../src/lib/admin/auth";
import type { AdminEnvironment } from "../../src/lib/admin/env";
import { createCancelImportHandler } from "../../src/app/api/admin/imports/[draftId]/route";
import { createPublishImportHandler } from "../../src/app/api/admin/imports/[draftId]/publish/route";
import { InMemoryGitWriter } from "../fixtures/in-memory-git-writer";
import { GitBranchConflictError } from "../../src/lib/github/write-client";
import { publishDraft } from "../../src/lib/imports/publish-service";
import { cancelDraft } from "../../src/lib/imports/draft-service";
import { signDraftToken } from "../../src/lib/imports/receipts";
import { makeNormalizedRun } from "../fixtures/normalized-run";

const NOW = 1_785_072_000_000;
const SECRET = "test-signing-secret";
const DRAFT_ID = "4f3a2d1c4b5e6f708192a3b4c5d6e7f8";
const TASK = "gmail-clone";
const APP_SLUG = "2026-07-26-lmarena-model-a";
const RUN_ID = "20260726T120000Z-model-a-lmarena";
const CSRF = "publish-route-csrf";
const environment: AdminEnvironment = {
  passwordHash: "unused-in-protected-routes",
  sessionSecret: SECRET,
  githubToken: "fake-github-token-that-must-not-leak"
};

const metadata = {
  run_id: RUN_ID,
  task: TASK,
  model: "Model A",
  harness: "lmarena",
  status: "success",
  app_name: APP_SLUG,
  type: "web-app",
  created_at: "2026-07-26T12:00:00.000Z",
  notes: "reviewed"
};

async function seedDraft(
  writer: InMemoryGitWriter,
  extraEntries: Array<{ path: string; sha: string }> = []
): Promise<string> {
  writer.textFiles.set("main-commit:imports/index.json", JSON.stringify({ version: 1, runs: [] }));
  const artifactSha = await writer.createBlob(new TextEncoder().encode("<html>published</html>"));
  const metadataSha = await writer.createBlob(new TextEncoder().encode(JSON.stringify(metadata)));
  const treeSha = await writer.createTree("main-tree", [
    ...(writer.treeEntries.get("main-commit") ?? [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({
        path: entry.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: entry.sha
      })),
    {
      path: `benchmarks/${TASK}/${APP_SLUG}/index.html`,
      mode: "100644",
      type: "blob",
      sha: artifactSha
    },
    {
      path: `runs/${RUN_ID}/data/${TASK}/metadata.json`,
      mode: "100644",
      type: "blob",
      sha: metadataSha
    },
    ...extraEntries.map((entry) => ({
      ...entry,
      mode: "100644" as const,
      type: "blob" as const
    }))
  ]);
  const commitSha = await writer.createCommit("Preview import", treeSha, "main-commit");
  writer.textFiles.set(
    `${commitSha}:runs/${RUN_ID}/data/${TASK}/metadata.json`,
    JSON.stringify(metadata)
  );
  const branch = `imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`;
  await writer.createBranch(branch, commitSha);
  return signDraftToken({
    version: 1,
    draftId: DRAFT_ID,
    branch,
    commitSha,
    task: TASK,
    appSlug: APP_SLUG,
    runId: RUN_ID,
    expiresAt: NOW + 60_000
  }, SECRET);
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    cookie: `benchmark_admin=${createAdminSession(SECRET, { csrf: CSRF })}`,
    origin: "https://hub.example",
    "x-csrf-token": CSRF,
    ...extra
  };
}

function tokenRequest(method: "POST" | "DELETE", draftToken: string, headers = adminHeaders()) {
  const body = JSON.stringify({ draftToken });
  return new Request(`https://hub.example/api/admin/imports/${DRAFT_ID}${method === "POST" ? "/publish" : ""}`, {
    method,
    headers: {
      ...headers,
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "application/json"
    },
    body
  });
}

describe("atomic import publication", () => {
  it("applies artifacts, metadata, and a complete versioned manifest in one main commit", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);

    const result = await publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer);

    const publishedCommitSha = writer.refs.get("main")!;
    const publishedCommit = writer.commits.find((commit) => commit.sha === publishedCommitSha)!;
    const publishedTree = writer.trees.get(publishedCommit.treeSha)!;
    expect(publishedTree.entries.map((entry) => entry.path).sort()).toEqual([
      `benchmarks/${TASK}/${APP_SLUG}/index.html`,
      "imports/index.json",
      `runs/${RUN_ID}/data/${TASK}/metadata.json`
    ]);
    const manifestEntry = publishedTree.entries.find((entry) => entry.path === "imports/index.json")!;
    expect(JSON.parse(new TextDecoder().decode(writer.blobs.get(manifestEntry.sha)))).toEqual({
      version: 1,
      runs: [result.run]
    });
    expect(result.run.id).toBe(`melvynx-benchmarks-${RUN_ID}`);
  });

  it("rejects a signed draft commit containing any change outside its exact destinations", async () => {
    const writer = new InMemoryGitWriter();
    const unexpectedSha = await writer.createBlob(new TextEncoder().encode("unexpected"));
    const draftToken = await seedDraft(writer, [{
      path: "README.md",
      sha: unexpectedSha
    }]);
    const commitsBeforePublish = writer.commits.length;

    await expect(publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer)).rejects.toThrow(/draft tree/i);

    expect(writer.refs.get("main")).toBe("main-commit");
    expect(writer.mainUpdateAttempts).toBe(0);
    expect(writer.commits).toHaveLength(commitsBeforePublish);
  });

  it("reserves the complete immutable application root, run root, and run identity", async () => {
    const collisions = [
      {
        name: "application root",
        tree: [{
          path: `benchmarks/${TASK}/${APP_SLUG}/old.js`,
          type: "blob",
          sha: "b".repeat(40)
        }]
      },
      {
        name: "run root",
        tree: [{
          path: `runs/${RUN_ID}/data/another-task/metadata.json`,
          type: "blob",
          sha: "c".repeat(40)
        }]
      },
      {
        name: "manifest run identity",
        manifest: {
          version: 1,
          runs: [makeNormalizedRun("different-public-id", {
            runId: RUN_ID,
            task: "another-task"
          })]
        }
      },
      {
        name: "manifest application slug",
        manifest: {
          version: 1,
          runs: [makeNormalizedRun("different-run", {
            runId: "different-run",
            task: TASK,
            previewPath: `benchmarks/${TASK}/${APP_SLUG}/index.html`
          })]
        }
      }
    ];

    for (const collision of collisions) {
      const writer = new InMemoryGitWriter();
      if (collision.tree) writer.treeEntries.set("main-commit", collision.tree);
      const draftToken = await seedDraft(writer);
      if (collision.manifest) {
        writer.textFiles.set("main-commit:imports/index.json", JSON.stringify(collision.manifest));
      }
      const commitsBeforePublish = writer.commits.length;

      await expect(publishDraft({
        draftId: DRAFT_ID,
        draftToken,
        secret: SECRET,
        now: NOW
      }, writer), collision.name).rejects.toThrow(/collision/i);

      expect(writer.refs.get("main"), collision.name).toBe("main-commit");
      expect(writer.mainUpdateAttempts, collision.name).toBe(0);
      expect(writer.commits, collision.name).toHaveLength(commitsBeforePublish);
    }
  });

  it("rebuilds once from the latest main head and manifest after a non-fast-forward conflict", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    const concurrentRun = makeNormalizedRun("concurrent-run", { task: "calendar-clone" });
    let concurrentCommitSha = "";
    let concurrentTreeSha = "";
    writer.failFirstMainUpdate = true;
    writer.onFirstMainUpdateConflict = async () => {
      const concurrentBlobSha = await writer.createBlob(new TextEncoder().encode("concurrent"));
      concurrentTreeSha = await writer.createTree("main-tree", [{
        path: "benchmarks/calendar-clone/existing/index.html",
        mode: "100644",
        type: "blob",
        sha: concurrentBlobSha
      }]);
      concurrentCommitSha = await writer.createCommit(
        "Concurrent publication",
        concurrentTreeSha,
        "main-commit"
      );
      writer.refs.set("main", concurrentCommitSha);
      writer.textFiles.set(
        `${concurrentCommitSha}:imports/index.json`,
        JSON.stringify({ version: 1, runs: [concurrentRun] })
      );
    };

    const result = await publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer);

    expect(writer.mainUpdateAttempts).toBe(2);
    expect(writer.forcedUpdates).toBe(0);
    const publishedCommit = writer.commits.find((commit) => commit.sha === writer.refs.get("main"))!;
    expect(publishedCommit.parentSha).toBe(concurrentCommitSha);
    expect(writer.trees.get(publishedCommit.treeSha)?.baseTreeSha).toBe(concurrentTreeSha);
    const manifestEntry = writer.trees.get(publishedCommit.treeSha)!.entries
      .find((entry) => entry.path === "imports/index.json")!;
    expect(JSON.parse(new TextDecoder().decode(writer.blobs.get(manifestEntry.sha))).runs).toEqual([
      concurrentRun,
      result.run
    ]);
  });

  it("revalidates every collision against the new main head before its single retry", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    let concurrentCommitSha = "";
    writer.failFirstMainUpdate = true;
    writer.onFirstMainUpdateConflict = async () => {
      const occupiedSha = await writer.createBlob(new TextEncoder().encode("claimed concurrently"));
      const concurrentTreeSha = await writer.createTree("main-tree", [{
        path: `benchmarks/${TASK}/${APP_SLUG}/claimed.txt`,
        mode: "100644",
        type: "blob",
        sha: occupiedSha
      }]);
      concurrentCommitSha = await writer.createCommit(
        "Concurrent destination claim",
        concurrentTreeSha,
        "main-commit"
      );
      writer.refs.set("main", concurrentCommitSha);
      writer.textFiles.set(
        `${concurrentCommitSha}:imports/index.json`,
        JSON.stringify({ version: 1, runs: [] })
      );
    };

    await expect(publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer)).rejects.toThrow(/collision/i);

    expect(writer.refs.get("main")).toBe(concurrentCommitSha);
    expect(writer.mainUpdateAttempts).toBe(1);
    expect(writer.refs.has(`imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`)).toBe(true);
  });

  it("cancels only the immutable branch bound to a valid draft token", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    const branch = `imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`;

    await cancelDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer);

    expect(writer.refs.has(branch)).toBe(false);

    const movedWriter = new InMemoryGitWriter();
    const movedToken = await seedDraft(movedWriter);
    movedWriter.refs.set(branch, "main-commit");
    await expect(cancelDraft({
      draftId: DRAFT_ID,
      draftToken: movedToken,
      secret: SECRET,
      now: NOW
    }, movedWriter)).rejects.toThrow(/match|draft/i);
    expect(movedWriter.refs.has(branch)).toBe(true);
  });

  it("retries a branch conflict only once and leaves the draft available", async () => {
    class AlwaysConflictingWriter extends InMemoryGitWriter {
      override async updateBranch(branch: string, commitSha: string, force = false): Promise<void> {
        if (force) throw new Error("Forced updates are forbidden");
        this.updateAttempts.push({ branch, commitSha, force: false });
        throw new GitBranchConflictError();
      }
    }
    const writer = new AlwaysConflictingWriter();
    const draftToken = await seedDraft(writer);
    const branch = `imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`;

    await expect(publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer)).rejects.toBeInstanceOf(GitBranchConflictError);

    expect(writer.mainUpdateAttempts).toBe(2);
    expect(writer.forcedUpdates).toBe(0);
    expect(writer.refs.get("main")).toBe("main-commit");
    expect(writer.refs.has(branch)).toBe(true);
  });

  it("does not retry a generic GitHub validation failure", async () => {
    class ValidationFailureWriter extends InMemoryGitWriter {
      override async updateBranch(branch: string, commitSha: string, force = false): Promise<void> {
        if (force) throw new Error("Forced updates are forbidden");
        this.updateAttempts.push({ branch, commitSha, force: false });
        throw new Error("GitHub request failed (422)");
      }
    }
    const writer = new ValidationFailureWriter();
    const draftToken = await seedDraft(writer);

    await expect(publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer)).rejects.toThrow("GitHub request failed (422)");

    expect(writer.mainUpdateAttempts).toBe(1);
    expect(writer.refs.get("main")).toBe("main-commit");
  });

  it("reports cleanup failure after publication and rejects every token replay", async () => {
    class CleanupFailureWriter extends InMemoryGitWriter {
      override async deleteBranch(): Promise<void> {
        throw new Error("cleanup unavailable");
      }
    }
    const cleanupWriter = new CleanupFailureWriter();
    const retainedToken = await seedDraft(cleanupWriter);
    const retainedResult = await publishDraft({
      draftId: DRAFT_ID,
      draftToken: retainedToken,
      secret: SECRET,
      now: NOW
    }, cleanupWriter);
    expect(retainedResult.cleanupWarning).toMatch(/temporary draft/i);
    expect(cleanupWriter.refs.get("main")).not.toBe("main-commit");

    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    await publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer);
    const commitsAfterPublication = writer.commits.length;

    await expect(publishDraft({
      draftId: DRAFT_ID,
      draftToken,
      secret: SECRET,
      now: NOW
    }, writer)).rejects.toThrow();
    expect(writer.commits).toHaveLength(commitsAfterPublication);
    expect(writer.mainUpdateAttempts).toBe(1);
  });
});

describe("publish and cancel routes", () => {
  it("requires the admin session, same origin, and CSRF before creating an injected writer", async () => {
    let writerCreations = 0;
    const dependencies = {
      readEnvironment: () => environment,
      createWriter: () => {
        writerCreations += 1;
        return new InMemoryGitWriter();
      },
      now: () => NOW,
      revalidateTag: () => undefined,
      revalidatePath: () => undefined
    };
    const POST = createPublishImportHandler(dependencies);
    const DELETE = createCancelImportHandler(dependencies);

    for (const headers of [
      {},
      { ...adminHeaders(), origin: "https://evil.example" },
      { ...adminHeaders(), "x-csrf-token": "wrong" }
    ]) {
      const publishResponse = await POST(tokenRequest("POST", "invalid", headers), {
        params: Promise.resolve({ draftId: DRAFT_ID })
      });
      const cancelResponse = await DELETE(tokenRequest("DELETE", "invalid", headers), {
        params: Promise.resolve({ draftId: DRAFT_ID })
      });
      expect(publishResponse.status).toBe(401);
      expect(cancelResponse.status).toBe(401);
    }
    expect(writerCreations).toBe(0);
  });

  it("publishes with the injected writer, returns public links despite cleanup warning, and invalidates exact caches", async () => {
    class CleanupWarningWriter extends InMemoryGitWriter {
      override async deleteBranch(): Promise<void> {
        throw new Error("temporary cleanup failure");
      }
    }
    const writer = new CleanupWarningWriter();
    const draftToken = await seedDraft(writer);
    const tags: Array<[string, { expire: 0 }]> = [];
    const paths: string[] = [];
    const POST = createPublishImportHandler({
      readEnvironment: () => environment,
      createWriter: () => writer,
      now: () => NOW,
      revalidateTag: (tag, profile) => tags.push([tag, profile]),
      revalidatePath: (path) => paths.push(path)
    });

    const response = await POST(tokenRequest("POST", draftToken), {
      params: Promise.resolve({ draftId: DRAFT_ID })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runUrl).toBe(`/runs/${encodeURIComponent(`melvynx-benchmarks-${RUN_ID}`)}`);
    expect(body.taskUrl).toBe(`/tasks/${encodeURIComponent(TASK)}`);
    expect(body.cleanupWarning).toMatch(/temporary draft/i);
    expect(tags).toEqual([["melvynx-imports", { expire: 0 }]]);
    expect(paths).toEqual([
      "/",
      `/tasks/${encodeURIComponent(TASK)}`,
      `/runs/${encodeURIComponent(`melvynx-benchmarks-${RUN_ID}`)}`
    ]);
  });

  it("keeps a truthful success response when post-publication invalidation fails", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    const invalidationAttempts: string[] = [];
    const POST = createPublishImportHandler({
      readEnvironment: () => environment,
      createWriter: () => writer,
      now: () => NOW,
      revalidateTag: (tag) => {
        invalidationAttempts.push(`tag:${tag}`);
        throw new Error("cache backend unavailable");
      },
      revalidatePath: (path) => {
        invalidationAttempts.push(`path:${path}`);
        throw new Error("cache backend unavailable");
      }
    });

    const response = await POST(tokenRequest("POST", draftToken), {
      params: Promise.resolve({ draftId: DRAFT_ID })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runUrl).toBe(`/runs/${encodeURIComponent(`melvynx-benchmarks-${RUN_ID}`)}`);
    expect(body.invalidationWarning).toMatch(/cache|invalidate/i);
    expect(body.error).toBeUndefined();
    expect(writer.refs.get("main")).not.toBe("main-commit");
    expect(writer.mainUpdateAttempts).toBe(1);
    expect(invalidationAttempts).toEqual([
      "tag:melvynx-imports",
      "path:/",
      `path:/tasks/${encodeURIComponent(TASK)}`,
      `path:/runs/${encodeURIComponent(`melvynx-benchmarks-${RUN_ID}`)}`
    ]);
  });

  it("cancels the verified draft through the injected writer", async () => {
    const writer = new InMemoryGitWriter();
    const draftToken = await seedDraft(writer);
    const branch = `imports/${Math.floor(NOW / 1_000)}-${DRAFT_ID}`;
    const DELETE = createCancelImportHandler({
      readEnvironment: () => environment,
      createWriter: () => writer,
      now: () => NOW
    });

    const response = await DELETE(tokenRequest("DELETE", draftToken), {
      params: Promise.resolve({ draftId: DRAFT_ID })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cancelled: true });
    expect(writer.refs.has(branch)).toBe(false);
  });
});
