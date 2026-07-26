export type RunStatus = "success" | "failed" | "partial" | "timeout" | "unknown";

export const MELVYNX_SOURCE_ID = "melvynx-benchmarks";
export const MELVYNX_SOURCE_REPO = "Melvynx/benchmarks";
export const MELVYNX_SOURCE_URL = "https://github.com/Melvynx/benchmarks";

export type NormalizedRun = {
  id: string;
  sourceId: string;
  sourceRepo: string;
  sourceUrl: string;
  runId: string | null;
  benchmarkName: string | null;
  task: string | null;
  promptName: string | null;
  promptPath: string | null;
  model: string | null;
  provider: string | null;
  harness: string | null;
  status: RunStatus;
  score: number | null;
  scoreLabel: string | null;
  durationMs: number | null;
  totalCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  transcriptPath: string | null;
  resultPath: string | null;
  evidencePath: string | null;
  previewPath: string | null;
  screenshotPath: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  raw: unknown;
};

export type SourceSyncState = "success" | "partial" | "failed" | "idle";

export type SourceSyncReport = {
  sourceId: string;
  status: SourceSyncState;
  runCount: number;
  syncedAt: string | null;
  error: string | null;
  warnings: string[];
};

export type BenchmarkSource = {
  id: string;
  repo: string;
  branch: string;
  adapter: string;
  enabled: boolean;
  allowlist: string[];
};

export type SyncReport = {
  generatedAt: string | null;
  sources: SourceSyncReport[];
};

export type RemoteFileReader = {
  listFiles(source: BenchmarkSource): Promise<string[]>;
  readText(source: BenchmarkSource, filePath: string): Promise<string>;
};

export type AdapterContext = { source: BenchmarkSource; files: string[]; reader: RemoteFileReader };
export type AdapterResult = { runs: NormalizedRun[]; warnings: string[] };
export type SourceAdapter = (context: AdapterContext) => Promise<AdapterResult>;
