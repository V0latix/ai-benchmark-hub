import { createHash } from "node:crypto";

import {
  benchmarkGitWriterValidators,
  type BenchmarkGitWriter,
  type GitTreeEntry
} from "../../src/lib/github/write-client";

type StoredTree = { baseTreeSha: string; entries: GitTreeEntry[] };

export class InMemoryGitWriter implements BenchmarkGitWriter {
  readonly blobs = new Map<string, Uint8Array>();
  readonly trees = new Map<string, StoredTree>();
  readonly commits: Array<{ sha: string; message: string; treeSha: string; parentSha: string }> = [];
  readonly refs = new Map<string, string>([["main", "main-commit"]]);
  readonly createdTreeEntries: GitTreeEntry[] = [];
  readonly updateAttempts: Array<{ branch: string; commitSha: string; force: false }> = [];
  readonly textFiles = new Map<string, string>();
  readonly treeEntries = new Map<string, Array<{ path: string; type: string; sha: string }>>();
  failFirstMainUpdate = false;
  private mainUpdateFailures = 0;
  private readonly commitTrees = new Map<string, string>([["main-commit", "main-tree"]]);

  get forcedUpdates(): number {
    return this.updateAttempts.filter((attempt) => attempt.force).length;
  }

  get mainUpdateAttempts(): number {
    return this.updateAttempts.filter((attempt) => attempt.branch === "main").length;
  }

  get mainCommits(): Array<{ sha: string; message: string; treeSha: string; parentSha: string; paths: string[] }> {
    return this.commits.filter((commit) => commit.parentSha === "main-commit" || this.refs.get("main") === commit.sha)
      .map((commit) => ({ ...commit, paths: this.trees.get(commit.treeSha)?.entries.map((entry) => entry.path) ?? [] }));
  }

  static withDraft(_draftToken: string): InMemoryGitWriter {
    return new InMemoryGitWriter();
  }

  async getHead(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    if (!benchmarkGitWriterValidators.readRef(ref)) throw new Error("Unsafe Git ref");
    const commitSha = this.refs.get(ref);
    if (!commitSha) throw new Error(`Unknown ref: ${ref}`);
    return { commitSha, treeSha: this.commitTrees.get(commitSha) ?? "main-tree" };
  }

  async createBlob(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes);
    const sha = createHash("sha1").update(copy).digest("hex");
    this.blobs.set(sha, copy);
    return sha;
  }

  async createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string> {
    if (!entries.every(benchmarkGitWriterValidators.treeEntry)) throw new Error("Unsafe Git tree entry");
    const copy = entries.map((entry) => ({ ...entry }));
    const sha = createHash("sha1").update(JSON.stringify({ baseTreeSha, entries: copy })).digest("hex");
    this.trees.set(sha, { baseTreeSha, entries: copy });
    this.createdTreeEntries.push(...copy);
    return sha;
  }

  async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
    const sha = createHash("sha1").update(JSON.stringify({ message, treeSha, parentSha, n: this.commits.length })).digest("hex");
    this.commits.push({ sha, message, treeSha, parentSha });
    this.commitTrees.set(sha, treeSha);
    return sha;
  }

  async createBranch(branch: string, commitSha: string): Promise<void> {
    if (!benchmarkGitWriterValidators.importBranch(branch)) throw new Error("Unsafe import branch");
    if (this.refs.has(branch)) throw new Error(`Branch already exists: ${branch}`);
    this.refs.set(branch, commitSha);
  }

  async updateBranch(branch: string, commitSha: string, force = false): Promise<void> {
    if (force) throw new Error("Forced updates are forbidden");
    if (!benchmarkGitWriterValidators.updateBranch(branch)) throw new Error("Unsafe Git branch");
    this.updateAttempts.push({ branch, commitSha, force: false });
    if (branch === "main" && this.failFirstMainUpdate && this.mainUpdateFailures++ === 0) {
      throw new Error("GitHub request failed (422)");
    }
    const currentCommitSha = this.refs.get(branch);
    if (!currentCommitSha) throw new Error(`Unknown ref: ${branch}`);
    if (!this.isDescendantOf(commitSha, currentCommitSha)) throw new Error("Non-fast-forward update");
    this.refs.set(branch, commitSha);
  }

  async deleteBranch(branch: string): Promise<void> {
    if (!benchmarkGitWriterValidators.importBranch(branch)) throw new Error("Unsafe import branch");
    this.refs.delete(branch);
  }

  async listBranches(prefix: string): Promise<string[]> {
    if (!benchmarkGitWriterValidators.branchPrefix(prefix)) throw new Error("Unsafe branch prefix");
    return [...this.refs.keys()].filter(benchmarkGitWriterValidators.importBranch);
  }

  async readText(path: string, ref: string): Promise<string | null> {
    if (!benchmarkGitWriterValidators.repositoryPath(path)) throw new Error("Unsafe repository path");
    if (!benchmarkGitWriterValidators.readRef(ref)) throw new Error("Unsafe Git ref");
    return this.textFiles.get(`${ref}:${path}`) ?? this.textFiles.get(path) ?? null;
  }

  async listTree(ref: string): Promise<Array<{ path: string; type: string; sha: string }>> {
    if (!benchmarkGitWriterValidators.readRef(ref) && !this.commitTrees.has(ref)) throw new Error("Unsafe Git ref");
    const commitSha = this.refs.get(ref) ?? ref;
    const treeSha = this.commitTrees.get(commitSha);
    if (treeSha) {
      const tree = this.trees.get(treeSha);
      if (tree) return tree.entries.map(({ path, type, sha }) => ({ path, type, sha }));
    }
    const entries = this.treeEntries.get(ref) ?? [];
    if (entries.some((entry) => (
      !benchmarkGitWriterValidators.repositoryPath(entry.path)
      || typeof entry.type !== "string" || entry.type.length === 0
      || typeof entry.sha !== "string" || entry.sha.length === 0
    ))) {
      throw new Error("Invalid in-memory tree entry");
    }
    return entries.map((entry) => ({ ...entry }));
  }

  private isDescendantOf(commitSha: string, ancestorSha: string): boolean {
    let candidateSha = commitSha;
    const visited = new Set<string>();
    while (candidateSha !== ancestorSha) {
      if (visited.has(candidateSha)) return false;
      visited.add(candidateSha);
      const commit = this.commits.find((entry) => entry.sha === candidateSha);
      if (!commit) return false;
      candidateSha = commit.parentSha;
    }
    return true;
  }
}
