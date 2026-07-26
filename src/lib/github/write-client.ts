export type GitTreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string;
};

export interface BenchmarkGitWriter {
  getHead(ref: string): Promise<{ commitSha: string; treeSha: string }>;
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
const importBranch = /^imports\/[a-z0-9-]{20,}$/;
const commitSha = /^[a-f0-9]{40}$/i;

type GitReferenceResponse = { object?: { sha?: unknown } };
type GitCommitResponse = { tree?: { sha?: unknown } };
type ShaResponse = { sha?: unknown };
type MatchingRefResponse = Array<{ ref?: unknown }>;
type ContentResponse = { content?: unknown; encoding?: unknown };
type TreeResponse = { tree?: Array<{ path?: unknown; type?: unknown; sha?: unknown }> };

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

  async createBlob(bytes: Uint8Array): Promise<string> {
    const result = await this.json<ShaResponse>("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(bytes).toString("base64"), encoding: "base64" })
    });
    return requiredSha(result.sha);
  }

  async createTree(baseTreeSha: string, entries: GitTreeEntry[]): Promise<string> {
    for (const entry of entries) {
      if (!isSafeRepositoryPath(entry.path) || entry.mode !== "100644" || entry.type !== "blob" || !entry.sha) {
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
    if (!importBranch.test(branch)) throw new Error("Unsafe import branch");
    await this.json("/git/refs", {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha })
    });
  }

  async updateBranch(branch: string, commitSha: string): Promise<void> {
    if (!isSafeUpdateBranch(branch)) throw new Error("Unsafe Git branch");
    await this.json(`/git/refs/heads/${encodePath(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitSha, force: false })
    });
  }

  async deleteBranch(branch: string): Promise<void> {
    if (!importBranch.test(branch)) throw new Error("Unsafe import branch");
    await this.request(`/git/refs/heads/${encodePath(branch)}`, { method: "DELETE" });
  }

  async listBranches(prefix: string): Promise<string[]> {
    if (prefix !== "imports/") throw new Error("Unsafe branch prefix");
    const refs = await this.json<MatchingRefResponse>(`/git/matching-refs/heads/${encodePath(prefix)}`);
    if (!Array.isArray(refs)) throw new Error("GitHub response was invalid");
    return refs.flatMap((entry) => {
      if (typeof entry.ref !== "string" || !entry.ref.startsWith("refs/heads/")) return [];
      const branch = entry.ref.slice("refs/heads/".length);
      return importBranch.test(branch) ? [branch] : [];
    });
  }

  async readText(path: string, ref: string): Promise<string | null> {
    if (!isSafeRepositoryPath(path)) throw new Error("Unsafe repository path");
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
    if (!Array.isArray(body.tree)) throw new Error("GitHub response was invalid");
    return body.tree.flatMap((entry) => (
      typeof entry.path === "string" && typeof entry.type === "string" && typeof entry.sha === "string"
        ? [{ path: entry.path, type: entry.type, sha: entry.sha }]
        : []
    ));
  }

  private assertReadRef(ref: string): void {
    if (!isSafeReadRef(ref)) throw new Error("Unsafe Git ref");
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(`${API_ROOT}${path}`, { ...init, headers: this.headers() });
    } catch {
      throw new Error("GitHub request failed");
    }
    if (!response.ok && response.status !== 404) throw new Error(`GitHub request failed (${response.status})`);
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
