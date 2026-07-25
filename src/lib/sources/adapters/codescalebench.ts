import { makeRun, number, object, text } from "./shared";
import type { SourceAdapter } from "../types";

export const codescalebenchAdapter: SourceAdapter = async (context) => {
  const paths = context.files.filter((path) => /SNAPSHOT\.json$/i.test(path));
  const runs = await Promise.all(paths.map(async (path) => {
    const raw = JSON.parse(await context.reader.readText(context.source, path)); const data = object(raw);
    return makeRun(context, raw, { runId: text(data.id), model: text(data.model), task: text(data.task), score: number(raw, ["reward", "score"]), totalCostUsd: number(raw, ["cost_usd"]), durationMs: number(raw, ["duration_ms"]), resultPath: path, tags: ["codescalebench"] });
  }));
  return { runs, warnings: [] };
};
