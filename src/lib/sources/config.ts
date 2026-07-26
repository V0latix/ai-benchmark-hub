import { MELVYNX_SOURCE_ID, MELVYNX_SOURCE_REPO, type BenchmarkSource } from "./types";

export const benchmarkSources: BenchmarkSource[] = [
  { id: MELVYNX_SOURCE_ID, repo: MELVYNX_SOURCE_REPO, branch: "main", adapter: "melvynx", enabled: true, allowlist: ["transcripts.json", "imports/index.json", "runs/**/data/**/metadata.json", "benchmarks/**/index.html", "benchmarks/**/dist/index.html", "prompts/**/v*.md"] }
];
