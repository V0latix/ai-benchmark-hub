import { makeRun, object, text } from "./shared";
import type { SourceAdapter } from "../types";

export const swebenchAdapter: SourceAdapter = async (context) => {
  const path = context.files.find((file) => /(?:all_preds\.jsonl|preds\.json)$/i.test(file));
  if (!path) return { runs: [], warnings: ["No predictions file found"] };
  const content = await context.reader.readText(context.source, path);
  const raw = path.endsWith(".jsonl") ? JSON.parse(content.split("\n").find(Boolean) ?? "{}") : JSON.parse(content);
  const data = object(Array.isArray(raw) ? raw[0] : raw);
  return { runs: [makeRun(context, raw, { runId: text(data.instance_id) ?? text(data.run_id), model: text(data.model_name_or_path) ?? text(data.model), task: text(data.instance_id), resultPath: path, tags: ["swebench", "submission"] })], warnings: [] };
};
