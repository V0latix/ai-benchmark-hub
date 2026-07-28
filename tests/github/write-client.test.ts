import { describe, expect, it } from "vitest";

import {
  createBenchmarkGitWriter,
  GitBranchConflictError,
  GitHubBenchmarkWriter
} from "../../src/lib/github/write-client";
import { InMemoryGitWriter } from "../fixtures/in-memory-git-writer";

type FetchCall = { input: string; init?: RequestInit };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fakeGitHub(responses: Response[]) {
  const calls: FetchCall[] = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected GitHub request in test");
    return next;
  };
  return { calls, fetcher };
}

function body(call: FetchCall): unknown {
  return JSON.parse(String(call.init?.body));
}

describe("GitHubBenchmarkWriter", () => {
  it("uses fixed Git Database endpoints and headers for a new fast-forward branch", async () => {
    const github = fakeGitHub([
      response({ sha: "blob-sha" }, 201),
      response({ sha: "tree-sha" }, 201),
      response({ sha: "commit-sha" }, 201),
      response({}, 201),
      response({}, 200)
    ]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.createBlob(new Uint8Array([0, 255, 1]))).resolves.toBe("blob-sha");
    await expect(writer.createTree("base-tree", [{
      path: "benchmarks/demo/index.html",
      mode: "100644",
      type: "blob",
      sha: "blob-sha"
    }])).resolves.toBe("tree-sha");
    await expect(writer.createCommit("Import benchmark", "tree-sha", "parent-sha")).resolves.toBe("commit-sha");
    await writer.createBranch("imports/1234567890-abcdefghij", "commit-sha");
    await writer.updateBranch("imports/1234567890-abcdefghij", "next-commit");

    expect(github.calls.map((call) => call.input)).toEqual([
      "https://api.github.com/repos/Melvynx/benchmarks/git/blobs",
      "https://api.github.com/repos/Melvynx/benchmarks/git/trees",
      "https://api.github.com/repos/Melvynx/benchmarks/git/commits",
      "https://api.github.com/repos/Melvynx/benchmarks/git/refs",
      "https://api.github.com/repos/Melvynx/benchmarks/git/refs/heads/imports/1234567890-abcdefghij"
    ]);
    expect(body(github.calls[0]!)).toEqual({ content: "AP8B", encoding: "base64" });
    expect(body(github.calls[1]!)).toEqual({
      base_tree: "base-tree",
      tree: [{ path: "benchmarks/demo/index.html", mode: "100644", type: "blob", sha: "blob-sha" }]
    });
    expect(body(github.calls[2]!)).toEqual({ message: "Import benchmark", tree: "tree-sha", parents: ["parent-sha"] });
    expect(body(github.calls[3]!)).toEqual({ ref: "refs/heads/imports/1234567890-abcdefghij", sha: "commit-sha" });
    expect(body(github.calls[4]!)).toEqual({ sha: "next-commit", force: false });
    for (const call of github.calls) {
      expect(call.init?.headers).toMatchObject({
        Authorization: "Bearer test-token",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "Content-Type": "application/json"
      });
    }
  });

  it("reads heads, text, trees, and only valid import branches through fixed endpoints", async () => {
    const github = fakeGitHub([
      response({ object: { sha: "commit-sha" } }),
      response({ tree: { sha: "tree-sha" } }),
      response([{ ref: "refs/heads/imports/1234567890-abcdefghij" }, { ref: "refs/heads/imports/not-valid" }]),
      response({ content: "aMOpbGxv", encoding: "base64" }),
      response({ truncated: false, tree: [{ path: "index.html", type: "blob", sha: "blob-sha" }] })
    ]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.getHead("main")).resolves.toEqual({ commitSha: "commit-sha", treeSha: "tree-sha" });
    await expect(writer.listBranches("imports/")).resolves.toEqual(["imports/1234567890-abcdefghij"]);
    await expect(writer.readText("imports/index.json", "main")).resolves.toBe("héllo");
    await expect(writer.listTree("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).resolves.toEqual([{ path: "index.html", type: "blob", sha: "blob-sha" }]);

    expect(github.calls.map((call) => call.input)).toEqual([
      "https://api.github.com/repos/Melvynx/benchmarks/git/ref/heads/main",
      "https://api.github.com/repos/Melvynx/benchmarks/git/commits/commit-sha",
      "https://api.github.com/repos/Melvynx/benchmarks/git/matching-refs/heads/imports/",
      "https://api.github.com/repos/Melvynx/benchmarks/contents/imports/index.json?ref=main",
      "https://api.github.com/repos/Melvynx/benchmarks/git/trees/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?recursive=1"
    ]);
  });

  it("rejects a truncated recursive tree instead of accepting an incomplete collision check", async () => {
    const github = fakeGitHub([response({
      truncated: true,
      tree: [{ path: "index.html", type: "blob", sha: "blob-sha" }]
    })]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.listTree("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .rejects.toThrow("GitHub response was invalid");
  });

  it("reads the immutable draft commit's single parent for an exact tree diff", async () => {
    const commitSha = "a".repeat(40);
    const parentSha = "b".repeat(40);
    const treeSha = "c".repeat(40);
    const github = fakeGitHub([response({
      tree: { sha: treeSha },
      parents: [{ sha: parentSha }]
    })]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.getCommit(commitSha)).resolves.toEqual({
      commitSha,
      treeSha,
      parentSha
    });
    expect(github.calls[0]?.input).toBe(
      `https://api.github.com/repos/Melvynx/benchmarks/git/commits/${commitSha}`
    );
  });

  it("classifies a rejected fast-forward update as a retryable conflict without forcing", async () => {
    const github = fakeGitHub([response({ message: "Update is not a fast forward" }, 422)]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.updateBranch("main", "next-commit"))
      .rejects.toBeInstanceOf(GitBranchConflictError);
    expect(body(github.calls[0]!)).toEqual({ sha: "next-commit", force: false });
  });

  it("keeps a generic 422 validation response non-retryable and its body private", async () => {
    const github = fakeGitHub([response({
      message: "Validation Failed: private upstream detail",
      errors: [{ code: "custom", message: "secret validation context" }]
    }, 422)]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    const failure = writer.updateBranch("main", "next-commit");
    await expect(failure).rejects.toThrow("GitHub request failed (422)");
    await expect(failure).rejects.not.toBeInstanceOf(GitBranchConflictError);
    await expect(failure).rejects.not.toThrow(/private upstream detail|secret validation context/);
    expect(github.calls).toHaveLength(1);
  });

  it("rejects every malformed recursive tree entry instead of silently omitting it", async () => {
    const github = fakeGitHub([response({
      truncated: false,
      tree: [
        { path: "index.html", type: "blob", sha: "blob-sha" },
        { path: "hidden.json", type: "blob" }
      ]
    })]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.listTree("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
      .rejects.toThrow("GitHub response was invalid");
  });

  it("rejects untrusted refs and paths before making a request", async () => {
    const github = fakeGitHub([]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.getHead("refs/heads/main")).rejects.toThrow("Unsafe Git ref");
    await expect(writer.createBranch("main", "sha")).rejects.toThrow("Unsafe import branch");
    await expect(writer.readText("../.env", "main")).rejects.toThrow("Unsafe repository path");
    await expect(writer.listBranches("main")).rejects.toThrow("Unsafe branch prefix");
    expect(github.calls).toEqual([]);
  });

  it("keeps tokens and remote response bodies out of errors", async () => {
    const writer = new GitHubBenchmarkWriter("very-secret-token", async () => new Response("very-secret-token", { status: 500 }));

    await expect(writer.createBlob(new Uint8Array([1]))).rejects.toThrow("GitHub request failed (500)");
    await expect(writer.createBlob(new Uint8Array([1]))).rejects.not.toThrow("very-secret-token");
  });

  it("accepts GitHub's empty successful response when deleting a draft branch", async () => {
    const github = fakeGitHub([new Response(null, { status: 204 })]);
    const writer = new GitHubBenchmarkWriter("test-token", github.fetcher as typeof fetch);

    await expect(writer.deleteBranch("imports/1234567890-abcdefghij")).resolves.toBeUndefined();
    expect(github.calls).toEqual([{
      input: "https://api.github.com/repos/Melvynx/benchmarks/git/refs/heads/imports/1234567890-abcdefghij",
      init: expect.objectContaining({ method: "DELETE" })
    }]);
  });

  it("reads the production token only from the server environment", async () => {
    const previous = process.env.BENCHMARK_GITHUB_TOKEN;
    const github = fakeGitHub([response({ sha: "blob-sha" }, 201)]);
    process.env.BENCHMARK_GITHUB_TOKEN = "environment-token";
    try {
      const writer = createBenchmarkGitWriter(github.fetcher as typeof fetch);
      await writer.createBlob(new Uint8Array([1]));
      expect(github.calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer environment-token" });
    } finally {
      if (previous === undefined) delete process.env.BENCHMARK_GITHUB_TOKEN;
      else process.env.BENCHMARK_GITHUB_TOKEN = previous;
    }
  });
});

describe("InMemoryGitWriter", () => {
  it("implements the full writer contract while recording blobs, trees, commits, refs, and forced updates", async () => {
    const writer = new InMemoryGitWriter();

    const blobSha = await writer.createBlob(new Uint8Array([104, 105]));
    const treeSha = await writer.createTree("main-tree", [{ path: "index.html", mode: "100644", type: "blob", sha: blobSha }]);
    const commitSha = await writer.createCommit("draft", treeSha, "main-commit");
    const nextCommitSha = await writer.createCommit("draft update", treeSha, commitSha);
    await writer.createBranch("imports/1234567890-abcdefghij", commitSha);
    await writer.updateBranch("imports/1234567890-abcdefghij", nextCommitSha);
    await writer.deleteBranch("imports/1234567890-abcdefghij");

    expect(writer.blobs.get(blobSha)).toEqual(new Uint8Array([104, 105]));
    expect(writer.createdTreeEntries).toEqual([{ path: "index.html", mode: "100644", type: "blob", sha: blobSha }]);
    expect(writer.commits).toContainEqual({ sha: commitSha, message: "draft", treeSha, parentSha: "main-commit" });
    expect(writer.refs.get("imports/1234567890-abcdefghij")).toBeUndefined();
    expect(writer.updateAttempts).toEqual([{ branch: "imports/1234567890-abcdefghij", commitSha: nextCommitSha, force: false }]);
    expect(writer.forcedUpdates).toBe(0);
  });

  it("rejects unsafe branches, refs, repository paths, and tree entries like the GitHub writer", async () => {
    const writer = new InMemoryGitWriter();

    await expect(writer.getHead("refs/heads/main")).rejects.toThrow("Unsafe Git ref");
    await expect(writer.createBranch("main", "main-commit")).rejects.toThrow("Unsafe import branch");
    await expect(writer.updateBranch("refs/heads/main", "main-commit")).rejects.toThrow("Unsafe Git branch");
    await expect(writer.deleteBranch("main")).rejects.toThrow("Unsafe import branch");
    await expect(writer.listBranches("main")).rejects.toThrow("Unsafe branch prefix");
    await expect(writer.readText("../.env", "main")).rejects.toThrow("Unsafe repository path");
    await expect(writer.listTree("refs/heads/main")).rejects.toThrow("Unsafe Git ref");
    await expect(writer.createTree("main-tree", [{
      path: "../hidden.json",
      mode: "100644",
      type: "blob",
      sha: "blob-sha"
    }])).rejects.toThrow("Unsafe Git tree entry");
  });

  it("rejects non-fast-forward and forced branch updates", async () => {
    const writer = new InMemoryGitWriter();
    const treeSha = await writer.createTree("main-tree", []);
    const currentCommitSha = await writer.createCommit("current", treeSha, "main-commit");
    const unrelatedCommitSha = await writer.createCommit("unrelated", treeSha, "main-commit");
    const branch = "imports/1234567890-abcdefghij";
    await writer.createBranch(branch, currentCommitSha);

    await expect(writer.updateBranch(branch, unrelatedCommitSha)).rejects.toThrow("Non-fast-forward update");
    await expect((writer.updateBranch as unknown as (
      branch: string,
      commitSha: string,
      force: boolean
    ) => Promise<void>)(branch, unrelatedCommitSha, true)).rejects.toThrow("Forced updates are forbidden");
    expect(writer.refs.get(branch)).toBe(currentCommitSha);
    expect(writer.forcedUpdates).toBe(0);
  });
});
