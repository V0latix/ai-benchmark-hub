import { parseMarkdownFacts } from "../../normalize/markdown";
import { makeRun, normalizeStatus, number, text } from "./shared";
import type { SourceAdapter } from "../types";

export const pyrosAdapter: SourceAdapter = async (context) => {
  const paths = context.files.filter((path) => /EVALUATION\.md$/i.test(path));
  const runs = await Promise.all(paths.map(async (path) => { const raw = await context.reader.readText(context.source, path); const data = parseMarkdownFacts(raw); return makeRun(context, raw, { model: text(data.model), score: number(data, ["score", "rating"]), scoreLabel: text(data.score), status: normalizeStatus(data.status), durationMs: number(data, ["time", "duration_ms"]), evidencePath: path, screenshotPath: context.files.find((file) => file.startsWith(path.slice(0, path.lastIndexOf("/"))) && /screenshot\.png$/.test(file)) ?? null, tags: ["pyros"] }); }));
  return { runs, warnings: [] };
};
