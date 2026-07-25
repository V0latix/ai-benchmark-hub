import { parseMarkdownFacts } from "../../normalize/markdown";
import { makeRun, normalizeStatus, number, object, text } from "./shared";
import type { SourceAdapter } from "../types";

export const akitaAdapter: SourceAdapter = async (context) => {
  const resultPath = context.files.find((path) => /results\/.*\/result\.json$/i.test(path));
  const raw = resultPath ? JSON.parse(await context.reader.readText(context.source, resultPath)) : await context.reader.readText(context.source, "docs/report.md");
  const data = resultPath ? object(raw) : parseMarkdownFacts(raw as string);
  return { runs: [makeRun(context, raw, { model: text(data.model), provider: text(data.provider), status: normalizeStatus(data.status), score: number(data, ["score"]), scoreLabel: text(data.score), totalCostUsd: number(data, ["cost_usd", "total_cost_usd"]), durationMs: number(data, ["duration_ms"]), resultPath, tags: ["akita"] })], warnings: [] };
};
