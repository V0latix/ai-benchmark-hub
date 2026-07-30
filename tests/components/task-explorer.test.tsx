// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskExplorer } from "../../src/components/task-explorer";
import { TaskRunBrowser } from "../../src/components/task-run-browser";
import type { NormalizedRun } from "../../src/lib/sources/types";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

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
    expect(preview.closest("a")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders an explicit empty thumbnail instead of an iframe without a representative preview", () => {
    render(<TaskExplorer cards={[{ ...cards[0], representativeRunId: null }]} />);

    expect(screen.getByText("Aucun aperçu disponible")).toBeInTheDocument();
    expect(screen.queryByTitle("Aperçu de Gmail clone")).not.toBeInTheDocument();
  });

  it("uses singular labels for a single run or model", () => {
    render(<TaskExplorer cards={[{ ...cards[0], runCount: 1, modelCount: 1 }]} />);

    expect(screen.getByText("1 run · 1 modèle")).toBeInTheDocument();
  });

  it("announces only a compact result count outside the task grid", () => {
    const { container } = render(<TaskExplorer cards={cards} />);
    const liveRegions = container.querySelectorAll('[aria-live="polite"]');

    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0]).toHaveTextContent("2 tâches affichées");
    expect(liveRegions[0].querySelector("article, iframe, a, button, input, dl")).toBeNull();
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

  it("shows each run effort and updates the active effort summary", () => {
    const xhigh = makeRun("run-xhigh", "gpt-5.6-sol", {
      raw: { effort: "xhigh" }
    });
    const ultra = makeRun("run-ultra", "gpt-5.6-sol", {
      raw: { effort: " ultra " }
    });

    render(
      <TaskRunBrowser
        initialRunId="run-xhigh"
        prompt={null}
        runs={[xhigh, ultra]}
        task="gmail-clone"
      />
    );

    expect(screen.getByText("Effort · xhigh")).toBeInTheDocument();
    expect(screen.getByText("Effort · ultra")).toBeInTheDocument();

    const effortDefinition = screen.getByText("Effort", { selector: "dt" }).closest("div");
    expect(effortDefinition).toHaveTextContent("xhigh");

    fireEvent.click(screen.getByRole("button", { name: /run run-ultra$/i }));
    expect(effortDefinition).toHaveTextContent("ultra");
  });

  it("omits malformed effort badges and keeps the active fallback explicit", () => {
    render(
      <TaskRunBrowser
        initialRunId="run-invalid"
        prompt={null}
        runs={[makeRun("run-invalid", "model-a", { raw: { effort: 42 } })]}
        task="gmail-clone"
      />
    );

    expect(screen.queryByText(/Effort ·/)).not.toBeInTheDocument();
    expect(screen.getByText("Effort", { selector: "dt" }).closest("div")).toHaveTextContent("—");
  });

  it("keeps an ambiguous run visible but disables its preview and detail link", () => {
    const ambiguous = makeRun("shared-run", "model-a");
    render(
      <TaskRunBrowser
        initialRunId="shared-run"
        prompt={null}
        runs={[ambiguous]}
        task="timezone-checker"
        unresolvableRunIds={["shared-run"]}
      />
    );

    expect(screen.getByRole("button", { name: /shared-run/i })).toBeInTheDocument();
    expect(screen.getByText(/identifiant est partagé entre plusieurs tâches/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Visual result for shared-run")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Voir le détail du run/i })).not.toBeInTheDocument();
  });

  it("keeps the active preview and metadata outside a compact live summary", () => {
    const { container } = render(
      <TaskRunBrowser
        initialRunId="run-a"
        prompt={null}
        runs={[makeRun("run-a", "model-a")]}
        task="gmail-clone"
      />
    );
    const liveRegions = container.querySelectorAll('[aria-live="polite"]');

    expect(liveRegions).toHaveLength(1);
    expect(liveRegions[0]).toHaveTextContent("Run actif : model-a, run-a");
    expect(liveRegions[0].querySelector("iframe, a, button, dl, section")).toBeNull();
  });

  it("formats a near-midnight publication date in UTC", () => {
    vi.stubEnv("TZ", "Europe/Paris");
    const nearMidnight = makeRun("near-midnight", "model-a", {
      createdAt: "2026-01-01T23:30:00Z"
    });

    render(
      <TaskRunBrowser
        initialRunId="near-midnight"
        prompt={null}
        runs={[nearMidnight]}
        task="gmail-clone"
      />
    );

    expect(screen.getByRole("button", { name: /1 janv\. 2026/i })).toBeInTheDocument();
    expect(screen.getAllByText("1 janv. 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText("2 janv. 2026")).not.toBeInTheDocument();
  });
});
