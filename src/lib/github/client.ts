import { isAllowedPath, isTextPath } from "./paths";
import type { BenchmarkSource } from "../sources/types";
import { IMPORT_LIMITS } from "../imports/types";

type TreeResponse = { tree?: Array<{ path: string; type: string }> };

export class SafeGitHubReader {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async listFiles(source: BenchmarkSource): Promise<string[]> {
    const response = await this.fetcher(`https://api.github.com/repos/${source.repo}/git/trees/${source.branch}?recursive=1`, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub tree request failed (${response.status})`);
    const body = await response.json() as TreeResponse;
    return (body.tree ?? []).filter((entry) => entry.type === "blob" && isAllowedPath(source, entry.path)).map((entry) => entry.path);
  }

  async readText(source: BenchmarkSource, filePath: string): Promise<string> {
    if (!isAllowedPath(source, filePath) || !isTextPath(filePath)) throw new Error(`Unsafe remote file path: ${filePath}`);
    const url = `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
    const response = await this.fetcher(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub file request failed (${response.status})`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > IMPORT_LIMITS.textFileBytes) throw new Error(`Remote file exceeds ${IMPORT_LIMITS.textFileBytes} bytes`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > IMPORT_LIMITS.textFileBytes) {
      throw new Error(`Remote file exceeds ${IMPORT_LIMITS.textFileBytes} bytes`);
    }
    return text;
  }

  async readBinary(source: BenchmarkSource, filePath: string): Promise<Uint8Array> {
    if (!isAllowedPath(source, filePath)) throw new Error(`Unsafe remote file path: ${filePath}`);
    const url = `https://raw.githubusercontent.com/${source.repo}/${source.branch}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
    const response = await this.fetcher(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub file request failed (${response.status})`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > IMPORT_LIMITS.fileBytes) throw new Error(`Remote file exceeds ${IMPORT_LIMITS.fileBytes} bytes`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > IMPORT_LIMITS.fileBytes) throw new Error(`Remote file exceeds ${IMPORT_LIMITS.fileBytes} bytes`);
    return bytes;
  }

  private headers(): HeadersInit {
    const token = process.env.GITHUB_TOKEN;
    return token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } : { Accept: "application/vnd.github+json" };
  }
}
