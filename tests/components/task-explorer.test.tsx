// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TaskExplorer } from "../../src/components/task-explorer";
import { TaskRunBrowser } from "../../src/components/task-run-browser";
import type { NormalizedRun } from "../../src/lib/sources/types";

afterEach(cleanup);

const cards = [
  {
    task: "gmail-clone",
    runCount: 9,
    modelCount: 6,
    models: ["claude-sonnet-5"],
    representativeRunId: "gmail"
  },
  {
    task: "figma-clone",
    runCount: 4,
    modelCount: 3,
    models: ["gpt-5.6-sol"],
    representativeRunId: "figma"
  }
];

function makeRun(id: string, model: string, overrides: Partial<NormalizedRun> = {}): NormalizedRun {
  return {
    id,
    sourceId: "melvynx-benchmarks",
    sourceRepo: "Melvynx/benchmarks",
    sourceUrl: "https://github.com/Melvynx/benchmarks",
    runId: id,
    benchmarkName: null,
    task: "gmail-clone",
    promptName: null,
    promptPath: null,
    model,
    provider: null,
    harness: null,
    status: "success",
    score: null,
    scoreLabel: null,
    durationMs: null,
    totalCostUsd: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    transcriptPath: null,
    resultPath: null,
    evidencePath: null,
    previewPath: `benchmarks/gmail-clone/${id}/index.html`,
    screenshotPath: null,
    createdAt: null,
    updatedAt: null,
    tags: [],
    raw: {},
    ...overrides
  };
}

describe("TaskExplorer", () => {
  it("filters task cards by task or model and keeps counts visible", () => {
    render(<TaskExplorer cards={cards} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sonnet" } });

    expect(screen.getByRole("link", { name: /Gmail clone/i })).toBeInTheDocument();
    expect(screen.getByText("9 runs · 6 modèles")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Figma clone/i })).not.toBeInTheDocument();
  });

  it("shows an explicit state when no task matches", () => {
    render(<TaskExplorer cards={cards} />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "introuvable" } });

    expect(screen.getByText(/Aucune tâche ne correspond/i)).toBeInTheDocument();
  });

  it("keeps card previews outside keyboard and pointer interaction", () => {
    render(<TaskExplorer cards={[cards[0]]} />);

    const preview = screen.getByTitle("Aperçu de Gmail clone");
    expect(screen.getByRole("link", { name: "Ouvrir Gmail clone, 9 runs et 6 modèles" })).toBeInTheDocument();
    expect(preview).toHaveAttribute("src", "/api/runs/gmail/visual?interactive=2");
    expect(preview).toHaveAttribute("tabindex", "-1");
    expect(preview).toHaveClass("pointer-events-none");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("uses singular labels for a single run or model", () => {
    render(<TaskExplorer cards={[{ ...cards[0], runCount: 1, modelCount: 1 }]} />);

    expect(screen.getByText("1 run · 1 modèle")).toBeInTheDocument();
  });
});

describe("TaskRunBrowser", () => {
  it("switches the active run and preserves unknown metadata as unknown", () => {
    const first = makeRun("run-a", "model-a", { harness: "codex" });
    const second = makeRun("run-b", "model-b");
    render(<TaskRunBrowser initialRunId="run-a" prompt="Construire une boîte mail." runs={[first, second]} task="gmail-clone" />);

    expect(screen.getByTitle("Visual result for run-a")).toBeInTheDocument();
    expect(screen.getByText("Aperçu du résultat")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la source" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /model-b/i }));

    expect(screen.getByTitle("Visual result for run-b")).toBeInTheDocument();
    expect(screen.getByText("Harness")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("distinguishes runs that share the same model metadata", () => {
    const first = makeRun("run-a", "model-a");
    const second = makeRun("run-b", "model-a");
    render(<TaskRunBrowser initialRunId="run-a" prompt={null} runs={[first, second]} task="gmail-clone" />);

    expect(screen.getByRole("button", { name: /run run-a$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run run-b$/i })).toBeInTheDocument();
  });
});
