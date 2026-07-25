import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { NormalizedRun, SyncReport } from "../sources/types";

export type CachePayload = { runs: NormalizedRun[]; report: SyncReport };

export function getDefaultCacheRoot(cwd = process.cwd(), isVercel = Boolean(process.env.VERCEL)): string {
  return isVercel ? join("/tmp", "benchmark-hub") : join(cwd, ".cache", "benchmark-hub");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function writeCache(payload: CachePayload, root = getDefaultCacheRoot()): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeJson(join(root, "runs.json"), payload.runs);
  await writeJson(join(root, "sync-report.json"), payload.report);
}

export async function readCache(root = getDefaultCacheRoot()): Promise<CachePayload> {
  const [runs, report] = await Promise.all([
    readFile(join(root, "runs.json"), "utf8").then((content) => JSON.parse(content) as NormalizedRun[]),
    readFile(join(root, "sync-report.json"), "utf8").then((content) => JSON.parse(content) as SyncReport)
  ]);
  return { runs, report };
}
