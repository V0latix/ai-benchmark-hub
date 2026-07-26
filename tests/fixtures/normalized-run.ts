import type { NormalizedRun } from "../../src/lib/sources/types";

export function makeNormalizedRun(id: string, overrides: Partial<NormalizedRun> = {}): NormalizedRun {
  return {
    id,
    sourceId: "melvynx-benchmarks",
    sourceRepo: "Melvynx/benchmarks",
    sourceUrl: "https://github.com/Melvynx/benchmarks",
    runId: id,
    benchmarkName: null,
    task: "gmail-clone",
    promptName: null,
    promptPath: null,
    model: "model-a",
    provider: null,
    harness: "lmarena",
    status: "unknown",
    score: null,
    scoreLabel: null,
    durationMs: null,
    totalCostUsd: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    transcriptPath: null,
    resultPath: `runs/${id}/data/gmail-clone/metadata.json`,
    evidencePath: null,
    previewPath: `benchmarks/gmail-clone/${id}/index.html`,
    screenshotPath: null,
    createdAt: "2026-07-26T10:00:00.000Z",
    updatedAt: null,
    tags: ["melvynx", "lmarena"],
    raw: {},
    ...overrides
  };
}
