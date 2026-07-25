import { makeRun, normalizeStatus, number, object, text } from "./shared";
import type { SourceAdapter } from "../types";

export const melvynxAdapter: SourceAdapter = async (context) => {
  const metadataFiles = context.files.filter((path) => /runs\/.*\/data\/.*metadata\.json$/i.test(path));
  const warnings: string[] = [];
  const runs = (await Promise.all(metadataFiles.map(async (path) => {
    try {
      const raw = JSON.parse(await context.reader.readText(context.source, path));
      const data = object(raw);
      const task = text(data.task);
      const applicationName = text(data.app_name);
      const previewRoot = task && applicationName ? `benchmarks/${task}/${applicationName}/` : null;
      return makeRun(context, raw, {
      runId: text(data.run_id) ?? text(data.id), model: text(data.model), task, harness: text(data.harness),
      status: normalizeStatus(data.status), durationMs: number(raw, ["duration_ms", "durationMs"]),
      totalCostUsd: number(raw, ["total_cost_usd", "cost_usd"]), inputTokens: number(raw, ["input_tokens"]),
      outputTokens: number(raw, ["output_tokens"]), totalTokens: number(raw, ["total_tokens"]), resultPath: path,
      previewPath: previewRoot ? context.files.find((candidate) => candidate.startsWith(previewRoot) && /(?:dist\/)?index\.html$/.test(candidate)) ?? null : null,
      transcriptPath: context.files.includes("transcripts.json") ? "transcripts.json" : null, tags: ["melvynx"]
      });
    } catch {
      warnings.push(`Skipped invalid JSON: ${path}`);
      return null;
    }
  }))).filter((run): run is NonNullable<typeof run> => run !== null);
  return { runs, warnings };
};
