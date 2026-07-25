import { SafeGitHubReader } from "../github/client";
import { writeCache } from "../storage/json-store";
import { benchmarkSources } from "./config";
import { adapterRegistry } from "./registry";
import type { BenchmarkSource, RemoteFileReader, SourceAdapter, SyncReport } from "./types";

type SyncOptions = { sourceId?: string; sources?: BenchmarkSource[]; reader?: RemoteFileReader; registry?: Record<string, SourceAdapter>; persist?: boolean };

export async function syncSources(options: SyncOptions = {}): Promise<SyncReport> {
  const sources = (options.sources ?? benchmarkSources).filter((source) => source.enabled && (!options.sourceId || source.id === options.sourceId));
  const reader = options.reader ?? new SafeGitHubReader(); const registry = options.registry ?? adapterRegistry;
  const sourceReports = []; const runs = [];
  for (const source of sources) {
    try {
      const files = await reader.listFiles(source); const adapter = registry[source.adapter]; if (!adapter) throw new Error(`Unknown adapter: ${source.adapter}`);
      const result = await adapter({ source, files, reader }); runs.push(...result.runs);
      sourceReports.push({ sourceId: source.id, status: result.warnings.length ? "partial" as const : "success" as const, runCount: result.runs.length, syncedAt: new Date().toISOString(), error: null, warnings: result.warnings });
    } catch (error) {
      sourceReports.push({ sourceId: source.id, status: "failed" as const, runCount: 0, syncedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown sync error", warnings: [] });
    }
  }
  const report: SyncReport = { generatedAt: new Date().toISOString(), sources: sourceReports };
  if (options.persist !== false) await writeCache({ runs, report });
  return report;
}
