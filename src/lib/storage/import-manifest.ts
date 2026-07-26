import {
  MELVYNX_SOURCE_ID,
  MELVYNX_SOURCE_REPO,
  MELVYNX_SOURCE_URL,
  type NormalizedRun,
  type RunStatus
} from "../sources/types";

const IMPORT_MANIFEST_URL = "https://raw.githubusercontent.com/Melvynx/benchmarks/main/imports/index.json";
const runStatuses: RunStatus[] = ["success", "failed", "partial", "timeout", "unknown"];

export type ImportedRunManifest = { version: 1; runs: NormalizedRun[] };
export type ParsedImportedRuns = { runs: NormalizedRun[]; warnings: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNormalizedRun(value: unknown): value is NormalizedRun {
  if (!isRecord(value)) return false;

  return typeof value.id === "string"
    && value.id.length > 0
    && value.sourceId === MELVYNX_SOURCE_ID
    && value.sourceRepo === MELVYNX_SOURCE_REPO
    && value.sourceUrl === MELVYNX_SOURCE_URL
    && isNullableString(value.runId)
    && isNullableString(value.benchmarkName)
    && isNullableString(value.task)
    && isNullableString(value.promptName)
    && isNullableString(value.promptPath)
    && isNullableString(value.model)
    && isNullableString(value.provider)
    && isNullableString(value.harness)
    && typeof value.status === "string"
    && runStatuses.includes(value.status as RunStatus)
    && isNullableNumber(value.score)
    && isNullableString(value.scoreLabel)
    && isNullableNumber(value.durationMs)
    && isNullableNumber(value.totalCostUsd)
    && isNullableNumber(value.inputTokens)
    && isNullableNumber(value.outputTokens)
    && isNullableNumber(value.totalTokens)
    && isNullableString(value.transcriptPath)
    && isNullableString(value.resultPath)
    && isNullableString(value.evidencePath)
    && isNullableString(value.previewPath)
    && isNullableString(value.screenshotPath)
    && isNullableString(value.createdAt)
    && isNullableString(value.updatedAt)
    && Array.isArray(value.tags)
    && value.tags.every((tag) => typeof tag === "string")
    && "raw" in value;
}

export function parseImportedRunManifest(value: unknown): ParsedImportedRuns {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.runs)) {
    return { runs: [], warnings: ["Imported run manifest schema is invalid"] };
  }

  const runs: NormalizedRun[] = [];
  const warnings: string[] = [];
  for (const [index, run] of value.runs.entries()) {
    if (isNormalizedRun(run)) runs.push(run);
    else warnings.push(`Skipped invalid imported run at index ${index}`);
  }

  return { runs, warnings };
}

export function mergeImportedRuns(bundled: NormalizedRun[], imported: NormalizedRun[]): NormalizedRun[] {
  const merged = [...bundled];
  const knownIdentities = new Set(bundled.map((run) => JSON.stringify([run.task, run.id])));

  for (const run of imported) {
    const identity = JSON.stringify([run.task, run.id]);
    if (knownIdentities.has(identity)) continue;
    merged.push(run);
    knownIdentities.add(identity);
  }

  return merged;
}

export async function readImportedRuns(fetcher: typeof fetch = fetch): Promise<ParsedImportedRuns> {
  try {
    const response = await fetcher(IMPORT_MANIFEST_URL, {
      next: { revalidate: 300, tags: ["melvynx-imports"] }
    } as RequestInit);

    if (response.status === 404) return { runs: [], warnings: [] };
    if (!response.ok) return { runs: [], warnings: ["Unable to refresh imported runs"] };

    return parseImportedRunManifest(await response.json());
  } catch {
    return { runs: [], warnings: ["Unable to refresh imported runs"] };
  }
}
