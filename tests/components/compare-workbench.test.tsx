// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompareWorkbench } from "../../src/components/compare-workbench";
import { RunMetadataGrid } from "../../src/components/run-metadata-grid";
import { makeNormalizedRun } from "../fixtures/normalized-run";
import { resolveComparison } from "../../src/lib/tasks/view-model";

const navigation = vi.hoisted(() => ({
  query: "",
  replace: vi.fn()
}));
const replace = navigation.replace;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(navigation.query)
}));

afterEach(() => {
  cleanup();
  navigation.query = "";
  replace.mockReset();
});

const readySelection = resolveComparison([
  makeNormalizedRun("left-run", {
    task: "gmail-clone",
    model: "model-a",
    previewPath: "benchmarks/gmail-clone/model-a/index.html"
  }),
  makeNormalizedRun("right-run", {
    task: "gmail-clone",
    model: "model-b",
    previewPath: "benchmarks/gmail-clone/model-b/index.html"
  }),
  makeNormalizedRun("other-task-run", {
    task: "figma-clone",
    model: "other-task-model"
  })
], { task: "gmail-clone", leftId: "left-run", rightId: "right-run" });

describe("CompareWorkbench", () => {
  it.each([
    ["missing", ""],
    ["task-only", "task=gmail-clone"]
  ])("canonicalizes a %s URL to the resolved visible comparison", (_label, query) => {
    navigation.query = query;

    render(<CompareWorkbench selection={readySelection} />);

    expect(replace).toHaveBeenLastCalledWith(
      "/compare?task=gmail-clone&left=left-run&right=right-run",
      { scroll: false }
    );
  });

  it("replaces invalid and foreign run params with the resolved same-task ids", () => {
    navigation.query = "task=gmail-clone&left=other-task-run&right=missing&extra=keep-me";

    render(<CompareWorkbench selection={readySelection} />);

    expect(replace).toHaveBeenLastCalledWith(
      "/compare?task=gmail-clone&left=left-run&right=right-run",
      { scroll: false }
    );
  });

  it("does not replace or loop when the current URL is already canonical", () => {
    navigation.query = "task=gmail-clone&left=left-run&right=right-run";
    const { rerender } = render(<CompareWorkbench selection={readySelection} />);

    rerender(<CompareWorkbench selection={readySelection} />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("shows one large preview and alternates focus between selected runs", () => {
    render(<CompareWorkbench selection={readySelection} />);

    expect(screen.getByTitle("Visual result for left-run")).toBeInTheDocument();
    expect(screen.queryByTitle("Visual result for right-run")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Modèle A/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Modèle B/ }));

    expect(screen.queryByTitle("Visual result for left-run")).not.toBeInTheDocument();
    expect(screen.getByTitle("Visual result for right-run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Modèle B/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("only offers models and run versions from the selected task", () => {
    render(<CompareWorkbench selection={readySelection} />);

    expect(screen.getByRole("option", { name: "model-a" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "model-b" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "other-task-model" })).not.toBeInTheDocument();
  });

  it("offers duplicate model run versions and writes only the valid comparison state to the URL", () => {
    const selection = resolveComparison([
      makeNormalizedRun("alpha-old", {
        task: "gmail-clone",
        model: "alpha",
        createdAt: "2026-01-01T23:30:00Z"
      }),
      makeNormalizedRun("alpha-new", {
        task: "gmail-clone",
        model: "alpha",
        createdAt: "2026-02-01T00:00:00Z"
      }),
      makeNormalizedRun("beta", { task: "gmail-clone", model: "beta" })
    ], { task: "gmail-clone", leftId: "alpha-new", rightId: "beta" });

    render(<CompareWorkbench selection={selection} />);

    expect(screen.getByLabelText("Version du run A")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1 janv. 2026 · alpha-old" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /alpha-new/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Version du run A"), { target: { value: "alpha-old" } });

    expect(replace).toHaveBeenLastCalledWith(
      "/compare?task=gmail-clone&left=alpha-old&right=beta",
      { scroll: false }
    );
  });

  it("clears incompatible run ids when the task changes", () => {
    render(<CompareWorkbench selection={readySelection} />);

    fireEvent.change(screen.getByLabelText("Tâche"), { target: { value: "figma-clone" } });

    expect(replace).toHaveBeenLastCalledWith("/compare?task=figma-clone", { scroll: false });
  });

  it("restores a comparison when URL navigation supplies a new resolved selection", () => {
    const { rerender } = render(<CompareWorkbench selection={readySelection} />);
    const restored = resolveComparison([
      makeNormalizedRun("figma-left", {
        task: "figma-clone",
        model: "figma-a",
        previewPath: "benchmarks/figma-clone/figma-left/index.html"
      }),
      makeNormalizedRun("figma-right", {
        task: "figma-clone",
        model: "figma-b",
        previewPath: "benchmarks/figma-clone/figma-right/index.html"
      })
    ], { task: "figma-clone", leftId: "figma-left", rightId: "figma-right" });

    rerender(<CompareWorkbench selection={restored} />);

    expect(screen.getByLabelText("Tâche")).toHaveValue("figma-clone");
    expect(screen.getByTitle("Visual result for figma-left")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith(
      "/compare?task=figma-clone&left=figma-left&right=figma-right",
      { scroll: false }
    );
  });

  it("uses semantic Preview, Details, and Code tabs with task-qualified artifact links", () => {
    render(<CompareWorkbench selection={readySelection} />);

    expect(screen.getByRole("tab", { name: "Aperçu" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Détails" }));
    expect(screen.getByRole("table")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Code" }));

    expect(screen.getByRole("link", { name: "Résultat A" })).toHaveAttribute(
      "href",
      "https://github.com/Melvynx/benchmarks/blob/main/runs/left-run/data/gmail-clone/metadata.json"
    );
    expect(screen.getByRole("link", { name: "Aperçu B" })).toHaveAttribute(
      "href",
      "https://github.com/Melvynx/benchmarks/blob/main/benchmarks/gmail-clone/model-b/index.html"
    );
    expect(screen.getAllByRole("link").every((link) => link.getAttribute("href")?.startsWith("https://github.com/"))).toBe(true);
  });

  it("keeps the split control desktop-only while retaining an alternating mobile preview", () => {
    render(<CompareWorkbench selection={readySelection} />);

    const splitControl = screen.getByRole("button", { name: "Vue scindée" });
    expect(splitControl).toHaveClass("hidden", "lg:inline-flex");
    fireEvent.click(splitControl);

    expect(splitControl).toHaveAttribute("aria-pressed", "true");
    const split = screen.getByRole("region", { name: "Vue scindée des runs" });
    expect(split).toHaveClass("hidden", "lg:grid");
    expect(within(split).getByTitle("Visual result for left-run")).toBeInTheDocument();
    expect(within(split).getByTitle("Visual result for right-run")).toBeInTheDocument();

    const mobile = screen.getByRole("region", { name: "Vue alternée mobile" });
    expect(mobile).toHaveClass("lg:hidden");
    expect(within(mobile).getByTitle("Visual result for left-run")).toBeInTheDocument();
    expect(within(mobile).queryByTitle("Visual result for right-run")).not.toBeInTheDocument();
  });

  it("shows distinct empty states without empty model selectors", () => {
    const { rerender } = render(<CompareWorkbench selection={resolveComparison([])} />);

    expect(screen.getByText(/Aucune tâche publiée/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const oneModel = resolveComparison([
      makeNormalizedRun("only", { task: "gmail-clone", model: "only-model" })
    ], { task: "gmail-clone" });
    rerender(<CompareWorkbench selection={oneModel} />);

    expect(screen.getByText(/deux modèles distincts/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Tâche")).toBeInTheDocument();
    expect(screen.queryByLabelText("Modèle A")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Modèle B")).not.toBeInTheDocument();
  });

  it("keeps an ambiguous selected run visible but never routes its id through a global run endpoint", () => {
    const ambiguousSelection = resolveComparison([
      makeNormalizedRun("shared", {
        task: "gmail-clone",
        model: "model-a",
        previewPath: "benchmarks/gmail-clone/shared/index.html"
      }),
      makeNormalizedRun("safe", { task: "gmail-clone", model: "model-b" }),
      makeNormalizedRun("shared", {
        task: "figma-clone",
        model: "other-model",
        previewPath: "benchmarks/figma-clone/shared/index.html"
      })
    ], { task: "gmail-clone", leftId: "shared", rightId: "safe" });

    const { container } = render(<CompareWorkbench selection={ambiguousSelection} />);

    expect(screen.getByRole("option", { name: "model-a" })).toBeInTheDocument();
    expect(screen.getAllByText(/run shared/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/identifiant est partagé entre plusieurs tâches/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Visual result for shared")).not.toBeInTheDocument();
    expect(container.querySelector('[src*="/api/runs/shared/"]')).toBeNull();
    expect(container.querySelector('a[href="/runs/shared"]')).toBeNull();
  });
});

describe("RunMetadataGrid", () => {
  it("aligns metadata and renders unknown values as an em dash without zero-filling", () => {
    const unknown = makeNormalizedRun("unknown", {
      model: null,
      harness: null,
      createdAt: null,
      score: null,
      totalCostUsd: null,
      durationMs: null,
      totalTokens: null
    });
    const zero = makeNormalizedRun("zero", {
      model: "model-zero",
      score: 0,
      totalCostUsd: 0,
      durationMs: 0,
      totalTokens: 0
    });

    render(<RunMetadataGrid left={unknown} right={zero} />);

    expect(screen.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "Modèle",
      "Harness",
      "Statut",
      "Date",
      "Score",
      "Coût",
      "Durée",
      "Tokens"
    ]);
    expect(within(screen.getByRole("row", { name: /Score/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["—", "0"]);
    expect(within(screen.getByRole("row", { name: /Coût/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["—", "0,00 $US"]);
    expect(within(screen.getByRole("row", { name: /Durée/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["—", "0 ms"]);
    expect(within(screen.getByRole("row", { name: /Tokens/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["—", "0"]);
  });

  it("formats near-midnight dates in UTC", () => {
    const nearMidnight = makeNormalizedRun("near-midnight", {
      createdAt: "2026-01-01T23:30:00Z"
    });

    render(<RunMetadataGrid left={nearMidnight} right={nearMidnight} />);

    expect(within(screen.getByRole("row", { name: /Date/ })).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "1 janv. 2026",
      "1 janv. 2026"
    ]);
  });
});
