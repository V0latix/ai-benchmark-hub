import type { NormalizedRun, SyncReport } from "../sources/types";
import { readCache } from "./json-store";

export type RunFilters = { search?: string; source?: string; model?: string; status?: string; harness?: string; sort?: "cost" | "score" | "date" | "duration" };

export async function getCache() {
  try { return await readCache(); } catch { return { runs: [] as NormalizedRun[], report: { generatedAt: null, sources: [] } as SyncReport }; }
}

export async function getSyncReport() {
  return (await getCache()).report;
}

export async function getDashboardMetrics() {
  const { runs, report } = await getCache();
  return { runs: runs.length, sources: report.sources.filter((source) => source.status !== "idle").length, cost: runs.reduce((sum, run) => sum + (run.totalCostUsd ?? 0), 0), models: new Set(runs.flatMap((run) => run.model ? [run.model] : [])).size, tasks: new Set(runs.flatMap((run) => run.task ? [run.task] : [])).size, syncedAt: report.generatedAt };
}

export async function queryRuns(filters: RunFilters = {}) {
  const { runs } = await getCache(); const query = filters.search?.toLowerCase().trim();
  const filtered = runs.filter((run) => (!filters.source || run.sourceId === filters.source) && (!filters.model || run.model === filters.model) && (!filters.status || run.status === filters.status) && (!filters.harness || run.harness === filters.harness) && (!query || [run.model, run.task, run.sourceId, run.provider, run.harness].some((value) => value?.toLowerCase().includes(query))));
  const key = filters.sort === "score" ? "score" : filters.sort === "date" ? "createdAt" : filters.sort === "duration" ? "durationMs" : "totalCostUsd";
  return [...filtered].sort((a, b) => { const av = a[key] ?? -Infinity; const bv = b[key] ?? -Infinity; return typeof av === "string" && typeof bv === "string" ? bv.localeCompare(av) : Number(bv) - Number(av); });
}

export async function getRunById(id: string) { return (await getCache()).runs.find((run) => run.id === id) ?? null; }

export async function getTaskSummaries() {
  const { runs } = await getCache(); const tasks = new Map<string, { task: string; runCount: number; sourceIds: Set<string> }>();
  for (const run of runs) if (run.task) { const entry = tasks.get(run.task) ?? { task: run.task, runCount: 0, sourceIds: new Set<string>() }; entry.runCount++; entry.sourceIds.add(run.sourceId); tasks.set(run.task, entry); }
  return [...tasks.values()].map((entry) => ({ task: entry.task, runCount: entry.runCount, sourceCount: entry.sourceIds.size })).sort((a, b) => a.task.localeCompare(b.task));
}

export async function getModelComparisons() {
  const { runs } = await getCache(); const groups = new Map<string, NormalizedRun[]>();
  for (const run of runs) if (run.model) groups.set(run.model, [...(groups.get(run.model) ?? []), run]);
  const average = (values: Array<number | null>) => { const known = values.filter((value): value is number => value !== null); return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null; };
  const rows = [...groups].map(([model, group]) => ({ model, runs: group.length, score: average(group.map((run) => run.score)), cost: average(group.map((run) => run.totalCostUsd)), duration: average(group.map((run) => run.durationMs)) }));
  return { rows, points: runs.filter((run) => run.score !== null && run.totalCostUsd !== null), bestValue: rows.filter((row) => row.score !== null && row.cost !== null && row.cost > 0).map((row) => ({ ...row, value: row.score! / row.cost! })).sort((a, b) => b.value - a.value) };
}
