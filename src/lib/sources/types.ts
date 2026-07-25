export type RunStatus = "success" | "failed" | "partial" | "timeout" | "unknown";

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
