import { MELVYNX_SOURCE_ID, MELVYNX_SOURCE_REPO, type BenchmarkSource } from "./types";

export const benchmarkSources: BenchmarkSource[] = [
  { id: MELVYNX_SOURCE_ID, repo: MELVYNX_SOURCE_REPO, branch: "main", adapter: "melvynx", enabled: true, allowlist: ["transcripts.json", "imports/index.json", "runs/**/data/**/metadata.json", "benchmarks/**/index.html", "benchmarks/**/dist/index.html", "prompts/**/v*.md"] },
  { id: "akita-rails-benchmark", repo: "akitaonrails/llm-coding-benchmark", branch: "master", adapter: "akita", enabled: true, allowlist: ["docs/report.md", "results/**/result.json", "results/**/*.log", "results/**/*.md"] },
  { id: "codescalebench", repo: "sourcegraph/CodeScaleBench", branch: "public", adapter: "codescalebench", enabled: true, allowlist: ["runs/snapshots/**/SNAPSHOT.json", "runs/snapshots/**/export/summary/**", "runs/snapshots/**/export/traces/**"] },
  { id: "swebench-experiments", repo: "SWE-bench/experiments", branch: "main", adapter: "swebench", enabled: true, allowlist: ["evaluation/**/metadata.yaml", "evaluation/**/metadata.yml", "**/all_preds.jsonl", "**/preds.json"] },
  { id: "tinybird-llm-benchmark", repo: "tinybirdco/llm-benchmark", branch: "main", adapter: "tinybird", enabled: true, allowlist: ["src/benchmark/results.json", "src/benchmark/validation-results.json", "src/benchmark/benchmark-config.json"] },
  { id: "pyros-agent-comparison", repo: "pyros-projects/agent-comparison", branch: "main", adapter: "pyros", enabled: true, allowlist: ["*/coding_agents/*/EVALUATION.md", "*/orchestration/**/EVALUATION.md", "**/.report/transcript.json", "**/.report/chat-log.md", "**/screenshot.png"] },
  { id: "agent-lens", repo: "agent-lens/agent-lens-bench", branch: "main", adapter: "agentlens", enabled: true, allowlist: ["leaderboard/data/leaderboard.csv", "reports/**/*.md", "outputs/**/*.json", "outputs/**/*.csv"] }
];
