import { describe, expect, it } from "vitest";

import { benchmarkSources } from "../../src/lib/sources/config";
import { getAdapter } from "../../src/lib/sources/registry";
import type { AdapterContext, RemoteFileReader } from "../../src/lib/sources/types";

const fixtureFiles: Record<string, string> = {
  "runs/demo/data/metadata.json": JSON.stringify({ run_id: "mel-1", task: "demo", model: "gpt-5", status: "success", total_cost_usd: 0.42, duration_ms: 1200 }),
  "docs/report.md": "- Model: Claude 4\n- Score: 82%\n- Status: pass",
  "runs/snapshots/demo/SNAPSHOT.json": JSON.stringify({ id: "code-1", model: "gemini-2.5", reward: 0.7 }),
  "all_preds.jsonl": JSON.stringify({ model_name_or_path: "swe-agent", instance_id: "submission-1" }),
  "src/benchmark/results.json": JSON.stringify([{ model: "tiny-model", score: 0.9, cost_usd: 0.1 }]),
  "python/coding_agents/demo/EVALUATION.md": "- Model: pyros-agent\n- Score: 75%\n- Status: success",
  "leaderboard/data/leaderboard.csv": "model,score,cost_usd\nagentlens-model,0.78,0.3\n"
};

const reader: RemoteFileReader = {
  listFiles: async () => Object.keys(fixtureFiles),
  readText: async (_source, path) => fixtureFiles[path] ?? ""
};

function context(id: string): AdapterContext {
  const source = benchmarkSources.find((candidate) => candidate.id === id)!;
  return { source, files: Object.keys(fixtureFiles), reader };
}

describe("source adapters", () => {
  it.each([
    ["melvynx-benchmarks", "gpt-5"],
    ["akita-rails-benchmark", "Claude 4"],
    ["codescalebench", "gemini-2.5"],
    ["swebench-experiments", "swe-agent"],
    ["tinybird-llm-benchmark", "tiny-model"],
    ["pyros-agent-comparison", "pyros-agent"],
    ["agent-lens", "agentlens-model"]
  ])("extracts a normalized run for %s", async (sourceId, model) => {
    const adapter = getAdapter(context(sourceId).source.adapter);
    const result = await adapter(context(sourceId));

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({ sourceId, model });
    expect(result.runs[0].raw).toBeTruthy();
  });

  it("returns a warning instead of throwing when Tinybird result data is absent", async () => {
    const tinybird = context("tinybird-llm-benchmark");
    const result = await getAdapter("tinybird")({ ...tinybird, files: [], reader: { listFiles: async () => [], readText: async () => { throw new Error("not found"); } } });
    expect(result).toEqual({ runs: [], warnings: ["No Tinybird results file found"] });
  });

  it("skips an empty Melvynx metadata file while keeping valid runs", async () => {
    const melvynx = context("melvynx-benchmarks");
    const result = await getAdapter("melvynx")({ ...melvynx, files: ["runs/demo/data/metadata.json", "runs/empty/data/metadata.json"] });
    expect(result.runs).toHaveLength(1);
    expect(result.warnings).toEqual(["Skipped invalid JSON: runs/empty/data/metadata.json"]);
  });

  it("uses the preview that belongs to the Melvynx task", async () => {
    const melvynx = context("melvynx-benchmarks");
    const result = await getAdapter("melvynx")({ ...melvynx, files: ["runs/demo/data/metadata.json", "benchmarks/other/index.html", "benchmarks/demo/preview/index.html"] });
    expect(result.runs[0].previewPath).toBe("benchmarks/demo/preview/index.html");
  });
});
