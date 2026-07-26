import { describe, expect, it } from "vitest";

import { benchmarkSources } from "../../src/lib/sources/config";
import { getAdapter } from "../../src/lib/sources/registry";
import { melvynxAdapter } from "../../src/lib/sources/adapters/melvynx";
import type { AdapterContext, RemoteFileReader } from "../../src/lib/sources/types";

const fixtureFiles: Record<string, string> = {
  "runs/demo/data/metadata.json": JSON.stringify({ run_id: "mel-1", task: "demo", model: "gpt-5", app_name: "claude-sonnet-5", status: "success", total_cost_usd: 0.42, duration_ms: 1200 })
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
  it("configures and registers only Melvynx", () => {
    expect(benchmarkSources.map((source) => source.id)).toEqual(["melvynx-benchmarks"]);
    expect(getAdapter("melvynx")).toBe(melvynxAdapter);
  });

  it("extracts a normalized Melvynx run", async () => {
    const melvynx = context("melvynx-benchmarks");
    const result = await getAdapter(melvynx.source.adapter)(melvynx);

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({ sourceId: "melvynx-benchmarks", model: "gpt-5" });
    expect(result.runs[0].raw).toBeTruthy();
  });

  it("skips an empty Melvynx metadata file while keeping valid runs", async () => {
    const melvynx = context("melvynx-benchmarks");
    const result = await getAdapter("melvynx")({ ...melvynx, files: ["runs/demo/data/metadata.json", "runs/empty/data/metadata.json"] });
    expect(result.runs).toHaveLength(1);
    expect(result.warnings).toEqual(["Skipped invalid JSON: runs/empty/data/metadata.json"]);
  });

  it("uses the preview that belongs to the exact Melvynx application", async () => {
    const melvynx = context("melvynx-benchmarks");
    const result = await getAdapter("melvynx")({ ...melvynx, files: ["runs/demo/data/metadata.json", "benchmarks/demo/claude-fable-5/index.html", "benchmarks/demo/claude-sonnet-5/index.html"] });
    expect(result.runs[0].previewPath).toBe("benchmarks/demo/claude-sonnet-5/index.html");
  });
});
