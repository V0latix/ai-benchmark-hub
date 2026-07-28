export type GitTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
};

export class GitBranchConflictError extends Error {
  constructor() {
    super("Git branch changed");
  }
}

export interface BenchmarkGitWriter {
  getHead(ref: string): Promise<{ commitSha: string; treeSha: string }>;
  getCommit(commitSha: string): Promise<{ commitSha: string; treeSha: string; parentSha: string }>;
  createBlob(bytes: Uint8Array): Promise<string>;
  createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string>;
  createCommit(message: string, treeSha: string, parentSha: string): Promise<string>;
  createBranch(branch: string, commitSha: string): Promise<void>;
  updateBranch(branch: string, commitSha: string): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
  listBranches(prefix: string): Promise<string[]>;
  readText(path: string, ref: string): Promise<string | null>;
  listTree(ref: string): Promise<Array<{ path: string; type: string; sha: string }>>;
}

const OWNER = "Melvynx";
const REPOSITORY = "benchmarks";
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
const API_VERSION = "2026-03-10";
const MAX_ERROR_BODY_BYTES = 16_384;
const importBranch = /^imports\/[a-z0-9-]{20,}$/;
const commitSha = /^[a-f0-9]{40}$/i;

type GitReferenceResponse = { object?: { sha?: unknown } };
type GitCommitResponse = { tree?: { sha?: unknown }; parents?: Array<{ sha?: unknown }> };
type ShaResponse = { sha?: unknown };
type MatchingRefResponse = Array<{ ref?: unknown }>;
type ContentResponse = { content?: unknown; encoding?: unknown };
type TreeResponse = { truncated?: unknown; tree?: Array<{ path?: unknown; type?: unknown; sha?: unknown }> };

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function isSafeRepositoryPath(path: string): boolean {
  return path.length > 0
    && !path.startsWith("/")
    && !path.endsWith("/")
    && !path.includes("\\")
    && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

function isSafeReadRef(ref: string): boolean {
  return ref === "main" || importBranch.test(ref) || commitSha.test(ref);
}

function isSafeUpdateBranch(branch: string): boolean {
  return branch === "main" || importBranch.test(branch);
}

function isSafeTreeEntry(entry: GitTreeEntry): boolean {
  return isSafeRepositoryPath(entry.path)
    && entry.mode === "100644"
    && entry.type === "blob"
    && typeof entry.sha === "string"
    && entry.sha.length > 0;
}

export const benchmarkGitWriterValidators = Object.freeze({
  branchPrefix: (prefix: string) => prefix === "imports/",
  importBranch: (branch: string) => importBranch.test(branch),
  readRef: isSafeReadRef,
  repositoryPath: isSafeRepositoryPath,
  treeEntry: isSafeTreeEntry,
  updateBranch: isSafeUpdateBranch
});

function requiredSha(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("GitHub response was invalid");
  return value;
}

function decodeBase64(content: string): string {
  const normalized = content.replace(/\s/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) {
    throw new Error("GitHub response was invalid");
  }
  return Buffer.from(normalized, "base64").toString("utf8");
}

async function readBoundedErrorMessage(response: Response): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength
    && (!/^(?:0|[1-9][0-9]*)$/.test(declaredLength) || Number(declaredLength) > MAX_ERROR_BODY_BYTES)
  ) {
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ERROR_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const message = (parsed as Record<string, unknown>).message;
    return typeof message === "string" && message.length <= 512 ? message : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

/** Server-side transport fixed to the benchmark repository. */
export class GitHubBenchmarkWriter implements BenchmarkGitWriter {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch
  ) {
    if (!token) throw new Error("BENCHMARK_GITHUB_TOKEN is required");
  }

  async getHead(ref: string): Promise<{ commitSha: string; treeSha: string }> {
    this.assertReadRef(ref);
    const reference = await this.json<GitReferenceResponse>(`/git/ref/heads/${encodePath(ref)}`);
    const commitSha = requiredSha(reference.object?.sha);
    const commit = await this.json<GitCommitResponse>(`/git/commits/${encodeURIComponent(commitSha)}`);
    return { commitSha, treeSha: requiredSha(commit.tree?.sha) };
  }

  async getCommit(value: string): Promise<{ commitSha: string; treeSha: string; parentSha: string }> {
    if (!commitSha.test(value)) throw new Error("Unsafe Git commit");
    const commit = await this.json<GitCommitResponse>(`/git/commits/${encodeURIComponent(value)}`);
    if (!Array.isArray(commit.parents) || commit.parents.length !== 1) {
      throw new Error("GitHub response was invalid");
    }
    return {
      commitSha: value,
      treeSha: requiredSha(commit.tree?.sha),
      parentSha: requiredSha(commit.parents[0]?.sha)
    };
  }

  async createBlob(bytes: Uint8Array): Promise<string> {
    const result = await this.json<ShaResponse>("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(bytes).toString("base64"), encoding: "base64" })
    });
    return requiredSha(result.sha);
  }

  async createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string> {
    for (const entry of entries) {
      if (!benchmarkGitWriterValidators.treeEntry(entry)) {
        throw new Error("Unsafe Git tree entry");
      }
    }
    const result = await this.json<ShaResponse>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: entries })
    });
    return requiredSha(result.sha);
  }

  async createCommit(message: string, treeSha: string, parentSha: string): Promise<string> {
    const result = await this.json<ShaResponse>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] })
    });
    return requiredSha(result.sha);
  }

  async createBranch(branch: string, commitSha: string): Promise<void> {
    if (!benchmarkGitWriterValidators.importBranch(branch)) throw new Error("Unsafe import branch");
    await this.json("/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha })
    });
  }

  async updateBranch(branch: string, commitSha: string): Promise<void> {
    if (!benchmarkGitWriterValidators.updateBranch(branch)) throw new Error("Unsafe Git branch");
    const response = await this.request(`/git/refs/heads/${encodePath(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitSha, force: false })
    }, [422]);
    if (response.status === 422) {
      const message = await readBoundedErrorMessage(response);
      if (message?.trim().toLocaleLowerCase("en-US") === "update is not a fast forward") {
        throw new GitBranchConflictError();
      }
      throw new Error("GitHub request failed (422)");
    }
    if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  }

  async deleteBranch(branch: string): Promise<void> {
    if (!benchmarkGitWriterValidators.importBranch(branch)) throw new Error("Unsafe import branch");
    await this.request(`/git/refs/heads/${encodePath(branch)}`, { method: "DELETE" });
  }

  async listBranches(prefix: string): Promise<string[]> {
    if (!benchmarkGitWriterValidators.branchPrefix(prefix)) throw new Error("Unsafe branch prefix");
    const refs = await this.json<MatchingRefResponse>(`/git/matching-refs/heads/${encodePath(prefix)}`);
    if (!Array.isArray(refs)) throw new Error("GitHub response was invalid");
    return refs.flatMap((entry) => {
      if (typeof entry.ref !== "string" || !entry.ref.startsWith("refs/heads/")) return [];
      const branch = entry.ref.slice("refs/heads/".length);
      return benchmarkGitWriterValidators.importBranch(branch) ? [branch] : [];
    });
  }

  async readText(path: string, ref: string): Promise<string | null> {
    if (!benchmarkGitWriterValidators.repositoryPath(path)) throw new Error("Unsafe repository path");
    this.assertReadRef(ref);
    const response = await this.request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    if (response.status === 404) return null;
    const body = await this.parseJson<ContentResponse>(response);
    if (body.encoding !== "base64" || typeof body.content !== "string") throw new Error("GitHub response was invalid");
    return decodeBase64(body.content);
  }

  async listTree(ref: string): Promise<Array<{ path: string; type: string; sha: string }>> {
    this.assertReadRef(ref);
    const body = await this.json<TreeResponse>(`/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (body.truncated !== false || !Array.isArray(body.tree)) throw new Error("GitHub response was invalid");
    return body.tree.map((entry) => {
      if (
        typeof entry.path !== "string" || !benchmarkGitWriterValidators.repositoryPath(entry.path)
        || typeof entry.type !== "string" || entry.type.length === 0
        || typeof entry.sha !== "string" || entry.sha.length === 0
      ) {
        throw new Error("GitHub response was invalid");
      }
      return { path: entry.path, type: entry.type, sha: entry.sha };
    });
  }

  private assertReadRef(ref: string): void {
    if (!benchmarkGitWriterValidators.readRef(ref)) throw new Error("Unsafe Git ref");
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION
    };
  }

  private async request(
    path: string,
    init: RequestInit = {},
    acceptedErrorStatuses: number[] = []
  ): Promise<Response> {
    let response: Response;
    try {
      const headers = init.body === undefined
        ? this.headers()
        : { ...this.headers(), "Content-Type": "application/json" };
      response = await this.fetcher(`${API_ROOT}${path}`, { ...init, headers });
    } catch {
      throw new Error("GitHub request failed");
    }
    if (!response.ok && response.status !== 404 && !acceptedErrorStatuses.includes(response.status)) {
      throw new Error(`GitHub request failed (${response.status})`);
    }
    return response;
  }

  private async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    if (response.status === 404) throw new Error("GitHub request failed (404)");
    return this.parseJson<T>(response);
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      throw new Error("GitHub response was invalid");
    }
  }
}

/** Creates the production writer without ever accepting a browser-provided token. */
export function createBenchmarkGitWriter(fetcher: typeof fetch = fetch): GitHubBenchmarkWriter {
  return new GitHubBenchmarkWriter(process.env.BENCHMARK_GITHUB_TOKEN ?? "", fetcher);
}
