import { makeRun, number, object, text } from "./shared";
import type { SourceAdapter } from "../types";

export const tinybirdAdapter: SourceAdapter = async (context) => {
  const path = "src/benchmark/results.json";
  if (!context.files.includes(path)) return { runs: [], warnings: ["No Tinybird results file found"] };
  const raw = JSON.parse(await context.reader.readText(context.source, path));
  const rows = Array.isArray(raw) ? raw : [raw];
  return { runs: rows.map((row) => { const data = object(row); return makeRun(context, row, { model: text(data.model), task: text(data.question), score: number(data, ["score", "correctness"]), totalCostUsd: number(data, ["cost_usd"]), durationMs: number(data, ["duration_ms"]), resultPath: path, tags: ["tinybird"] }); }), warnings: [] };
};
