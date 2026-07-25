import { describe, expect, it } from "vitest";

import { syncSources } from "../../src/lib/sources/sync";

describe("syncSources", () => {
  it("records an adapter failure and continues with the next source", async () => {
    const report = await syncSources({
      sources: [
        { id: "one", repo: "owner/one", branch: "main", adapter: "one", enabled: true, allowlist: ["data.json"] },
        { id: "two", repo: "owner/two", branch: "main", adapter: "two", enabled: true, allowlist: ["data.json"] }
      ],
      reader: { listFiles: async () => ["data.json"], readText: async () => "{}" },
      registry: {
        one: async () => ({ runs: [], warnings: [] }),
        two: async () => { throw new Error("fixture failure"); }
      },
      persist: false
    });

    expect(report.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "one", status: "partial", warnings: ["No runs extracted"] }),
      expect.objectContaining({ sourceId: "two", status: "failed", error: "fixture failure" })
    ]));
  });

  it("marks an empty successful adapter result as partial", async () => {
    const report = await syncSources({ sources: [{ id: "empty", repo: "owner/empty", branch: "main", adapter: "empty", enabled: true, allowlist: ["data.json"] }], reader: { listFiles: async () => ["data.json"], readText: async () => "{}" }, registry: { empty: async () => ({ runs: [], warnings: [] }) }, persist: false });
    expect(report.sources[0]).toMatchObject({ status: "partial", warnings: ["No runs extracted"] });
  });
});
