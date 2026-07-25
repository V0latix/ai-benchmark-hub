import { findNumber } from "../../normalize/numbers";
import { normalizeStatus } from "../../normalize/status";
import type { AdapterContext, NormalizedRun } from "../types";

export function githubFileUrl(repo: string, branch: string, path: string): string {
  return `https://github.com/${repo}/blob/${branch}/${path}`;
}

export function makeRun(context: AdapterContext, raw: unknown, fields: Partial<NormalizedRun>): NormalizedRun {
  const key = fields.runId ?? fields.resultPath ?? fields.model ?? "run";
  return {
    id: `${context.source.id}-${key}`.replace(/[^a-zA-Z0-9_-]+/g, "-"),
    sourceId: context.source.id, sourceRepo: context.source.repo,
    sourceUrl: `https://github.com/${context.source.repo}`,
    runId: null, benchmarkName: null, task: null, promptName: null, promptPath: null,
    model: null, provider: null, harness: null, status: "unknown", score: null, scoreLabel: null,
    durationMs: null, totalCostUsd: null, inputTokens: null, outputTokens: null, totalTokens: null,
    transcriptPath: null, resultPath: null, evidencePath: null, previewPath: null, screenshotPath: null,
    createdAt: null, updatedAt: null, tags: [], raw, ...fields
  };
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function number(value: unknown, keys: string[]): number | null {
  return findNumber(value, keys);
}

export { normalizeStatus };
