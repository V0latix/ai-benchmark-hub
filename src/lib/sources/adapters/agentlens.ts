import { makeRun } from "./shared";
import type { SourceAdapter } from "../types";

export const agentlensAdapter: SourceAdapter = async (context) => {
  const path = "leaderboard/data/leaderboard.csv"; const raw = await context.reader.readText(context.source, path);
  const [headerLine, ...lines] = raw.trim().split(/\r?\n/); const headers = headerLine.split(",").map((header) => header.trim());
  return { runs: lines.filter(Boolean).map((line) => { const values = line.split(","); const row = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])); return makeRun(context, row, { model: row.model || null, score: Number.isFinite(Number(row.score)) ? Number(row.score) : null, totalCostUsd: Number.isFinite(Number(row.cost_usd)) ? Number(row.cost_usd) : null, resultPath: path, tags: ["agentlens", "leaderboard"] }); }), warnings: [] };
};
