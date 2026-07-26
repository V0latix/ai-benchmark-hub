# Public Explorer and Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-source dashboard with a polished, task-first Melvynx explorer and a shareable same-task, two-run comparison experience.

**Architecture:** Keep the bundled Melvynx snapshot as the baseline and merge a small, cached `imports/index.json` overlay from `Melvynx/benchmarks`. Build pure task and comparison view-model functions above that merged run list, then use focused client components only for search and interactive selection.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Tailwind CSS 4, Lucide React, Vitest, Testing Library.

## Global Constraints

- `Melvynx/benchmarks` is the only public source of truth.
- Every visitor can browse every published task and run without an account.
- Model comparison always starts with one task and two distinct runs from that task.
- The primary comparison interaction is an alternating full-size preview; split view is secondary and desktop-only.
- Unknown values render as `—`; never infer missing measurements.
- The app remains deployable on Vercel and usable locally without live GitHub data.
- Do not add scoring, voting, automated judging, public submissions, or another benchmark source.
- Preserve the existing sandboxed preview security boundary.

---

### Task 1: Public imported-run overlay

**Files:**
- Create: `src/lib/storage/import-manifest.ts`
- Create: `tests/storage/import-manifest.test.ts`
- Create: `tests/fixtures/normalized-run.ts`
- Modify: `src/lib/storage/json-store.ts`
- Modify: `src/lib/storage/queries.ts`
- Modify: `src/lib/sources/types.ts`
- Modify: `src/lib/sources/config.ts`

**Interfaces:**
- Produces: `ImportedRunManifest`, `parseImportedRunManifest(value)`, `mergeImportedRuns(bundled, imported)`, `readImportedRuns(fetcher?)`.
- Changes: `getCache()` returns bundled/local runs merged with valid public imported runs.
- Consumes: existing `NormalizedRun` and the bundled snapshot.

- [ ] **Step 1: Write failing manifest parsing and merging tests**

```ts
import { describe, expect, it } from "vitest";
import { mergeImportedRuns, parseImportedRunManifest } from "../../src/lib/storage/import-manifest";
import type { NormalizedRun } from "../../src/lib/sources/types";

const run = (id: string, overrides: Partial<NormalizedRun> = {}) => ({
  id,
  sourceId: "melvynx-benchmarks",
  sourceRepo: "Melvynx/benchmarks",
  sourceUrl: "https://github.com/Melvynx/benchmarks",
  runId: id,
  benchmarkName: null,
  task: "gmail-clone",
  promptName: null,
  promptPath: null,
  model: "model-a",
  provider: null,
  harness: "lmarena",
  status: "unknown",
  score: null,
  scoreLabel: null,
  durationMs: null,
  totalCostUsd: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  transcriptPath: null,
  resultPath: `runs/${id}/data/gmail-clone/metadata.json`,
  evidencePath: null,
  previewPath: `benchmarks/gmail-clone/${id}/index.html`,
  screenshotPath: null,
  createdAt: "2026-07-26T10:00:00.000Z",
  updatedAt: null,
  tags: ["melvynx", "lmarena"],
  raw: {},
  ...overrides
}) satisfies NormalizedRun;

describe("import manifest", () => {
  it("keeps valid Melvynx runs and drops invalid entries", () => {
    const parsed = parseImportedRunManifest({ version: 1, runs: [run("ok"), { id: "bad" }] });
    expect(parsed.runs.map((item) => item.id)).toEqual(["ok"]);
    expect(parsed.warnings).toEqual(["Skipped invalid imported run at index 1"]);
  });

  it("lets an imported run replace a bundled run with the same stable id", () => {
    expect(mergeImportedRuns(
      [run("same", { task: "old-task" })],
      [run("same", { task: "new-task" })]
    )[0].task).toBe("new-task");
  });
});
```

Move the complete factory shown above to
`tests/fixtures/normalized-run.ts` as
`makeNormalizedRun(id, overrides?)`. Use it in every later run-based test so
all fixtures satisfy the same `NormalizedRun` contract.

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `pnpm test -- tests/storage/import-manifest.test.ts`

Expected: FAIL because `src/lib/storage/import-manifest.ts` does not exist.

- [ ] **Step 3: Implement the manifest contract and safe merge**

```ts
export type ImportedRunManifest = { version: 1; runs: NormalizedRun[] };
export type ParsedImportedRuns = { runs: NormalizedRun[]; warnings: string[] };

export function parseImportedRunManifest(value: unknown): ParsedImportedRuns;
export function mergeImportedRuns(
  bundled: NormalizedRun[],
  imported: NormalizedRun[]
): NormalizedRun[];
export async function readImportedRuns(
  fetcher?: typeof fetch
): Promise<ParsedImportedRuns>;
```

`readImportedRuns` must fetch
`https://raw.githubusercontent.com/Melvynx/benchmarks/main/imports/index.json`
with `next: { revalidate: 300, tags: ["melvynx-imports"] }`, return an empty
overlay on `404`, and return a non-throwing freshness warning on network or
schema failure.

Add `imports/index.json` to the sole source allowlist. Remove every
`BenchmarkSource` entry except `melvynx-benchmarks`.

- [ ] **Step 4: Merge the overlay in the query boundary**

Keep local cache files authoritative during local development. When
`process.env.VERCEL` is truthy or no local cache exists, merge the bundled
snapshot with `readImportedRuns()`. Extend the cache result with
`freshnessWarnings: string[]` and update query callers without leaking raw fetch
errors.

- [ ] **Step 5: Run focused and existing storage tests**

Run: `pnpm test -- tests/storage/import-manifest.test.ts tests/storage/json-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/import-manifest.ts src/lib/storage/json-store.ts src/lib/storage/queries.ts src/lib/sources/types.ts src/lib/sources/config.ts tests/storage/import-manifest.test.ts tests/fixtures/normalized-run.ts
git commit -m "feat: merge public Melvynx imports"
```

### Task 2: Task and comparison view models

**Files:**
- Create: `src/lib/tasks/view-model.ts`
- Create: `tests/tasks/view-model.test.ts`
- Modify: `src/lib/storage/queries.ts`

**Interfaces:**
- Consumes: merged `NormalizedRun[]`.
- Produces: `TaskCardView`, `TaskDetailView`, `ComparisonSelection`.
- Produces functions:
  `buildTaskCards(runs, query?)`,
  `buildTaskDetail(runs, task)`,
  `resolveComparison(runs, requested)`.

- [ ] **Step 1: Write failing task grouping tests**

```ts
const run = makeNormalizedRun;

describe("buildTaskCards", () => {
  it("groups by task, counts unique models, and prefers a run with a preview", () => {
    const cards = buildTaskCards([
      run("a", { task: "gmail-clone", model: "model-a", previewPath: null }),
      run("b", { task: "gmail-clone", model: "model-b", previewPath: "benchmarks/gmail-clone/b/index.html" })
    ]);
    expect(cards[0]).toMatchObject({
      task: "gmail-clone",
      runCount: 2,
      modelCount: 2,
      representativeRunId: "b"
    });
  });

  it("matches either a task name or one of its model names", () => {
    const cards = buildTaskCards([run("a", { task: "gmail-clone", model: "claude-sonnet-5" })], "sonnet");
    expect(cards.map((card) => card.task)).toEqual(["gmail-clone"]);
  });
});
```

- [ ] **Step 2: Write failing comparison resolution tests**

```ts
describe("resolveComparison", () => {
  it("chooses the newest run for the first two distinct models in one task", () => {
    const selection = resolveComparison([
      run("a-old", { task: "gmail-clone", model: "model-a", createdAt: "2026-01-01T00:00:00Z" }),
      run("a-new", { task: "gmail-clone", model: "model-a", createdAt: "2026-02-01T00:00:00Z" }),
      run("b", { task: "gmail-clone", model: "model-b" }),
      run("other", { task: "figma-clone", model: "model-c" })
    ], { task: "gmail-clone" });
    expect(selection).toMatchObject({ task: "gmail-clone", leftId: "a-new", rightId: "b" });
  });

  it("clears ids that do not belong to the selected task or duplicate the same run", () => {
    const selection = resolveComparison([
      run("gmail-a", { task: "gmail-clone", model: "model-a" }),
      run("gmail-b", { task: "gmail-clone", model: "model-b" }),
      run("figma", { task: "figma-clone", model: "model-c" })
    ], { task: "gmail-clone", leftId: "figma", rightId: "figma" });
    expect(selection).toMatchObject({ leftId: "gmail-a", rightId: "gmail-b" });
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm test -- tests/tasks/view-model.test.ts`

Expected: FAIL because the view-model module is missing.

- [ ] **Step 4: Implement pure view-model functions**

```ts
export type TaskCardView = {
  task: string;
  runCount: number;
  modelCount: number;
  models: string[];
  representativeRunId: string | null;
};

export type ComparisonRequest = {
  task?: string;
  leftId?: string;
  rightId?: string;
};

export type ComparisonSelection = {
  task: string | null;
  leftId: string | null;
  rightId: string | null;
  tasks: Array<{ task: string; modelCount: number }>;
  models: Array<{ model: string; runs: NormalizedRun[] }>;
  reason: "ready" | "no-tasks" | "not-enough-models";
};
```

Use stable alphabetical task/model ordering. Sort multiple runs newest first,
placing unknown dates after known dates. Prefer representative runs with a valid
preview path.

- [ ] **Step 5: Replace aggregate query helpers**

Add `getTaskCards(query?)`, `getTaskDetail(task)`, and
`getComparisonSelection(request)` to `src/lib/storage/queries.ts`. Remove
`getDashboardMetrics()` and `getModelComparisons()` once no page consumes them.

- [ ] **Step 6: Run tests**

Run: `pnpm test -- tests/tasks/view-model.test.ts tests/tasks/catalog.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tasks/view-model.ts src/lib/storage/queries.ts tests/tasks/view-model.test.ts
git commit -m "feat: add task and comparison view models"
```

### Task 3: App shell and visual foundation

**Files:**
- Create: `src/components/app-nav.tsx`
- Create: `tests/components/app-nav.test.tsx`
- Create: `tests/setup.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `AppNav()` with active-route treatment and an admin import action.
- Consumes: Next.js `usePathname`, existing App Router layout.

- [ ] **Step 1: Write the failing navigation test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { AppNav } from "../../src/components/app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/compare" }));

it("marks Compare as the current destination and exposes the admin import", () => {
  render(<AppNav />);
  expect(screen.getByRole("link", { name: "Comparer" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Ajouter un run/ })).toHaveAttribute("href", "/admin/import");
});
```

Add `import "@testing-library/jest-dom/vitest";` to `tests/setup.ts` and set
`setupFiles: ["./tests/setup.ts"]` in `vitest.config.ts`. Every component test
created by these two plans starts with `// @vitest-environment jsdom`.

- [ ] **Step 2: Run the test and verify the missing-component failure**

Run: `pnpm test -- tests/components/app-nav.test.tsx`

Expected: FAIL because `AppNav` is missing.

- [ ] **Step 3: Implement the shell**

The exact destinations are:

```ts
const destinations = [
  { href: "/", label: "Explorer" },
  { href: "/compare", label: "Comparer" },
  { href: "/runs", label: "Tous les runs" }
];
```

Use a compact mobile-safe header, `aria-current="page"`, a visible focus ring,
and a right-aligned `/admin/import` action. Remove the methodology banner and
the Sources link.

- [ ] **Step 4: Establish design tokens and base states**

In `globals.css`, define named CSS variables for canvas, surfaces, borders,
muted/primary text, accent, success, warning, and danger. Add:

```css
* { box-sizing: border-box; }
body { min-width: 320px; background: var(--canvas); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
```

Set `<html lang="fr">` and update metadata to describe Melvynx task comparison.

- [ ] **Step 5: Run navigation test, lint, and typecheck**

Run: `pnpm test -- tests/components/app-nav.test.tsx && pnpm lint && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/app-nav.tsx src/components/app-shell.tsx src/app/globals.css src/app/layout.tsx tests/components/app-nav.test.tsx tests/setup.ts vitest.config.ts
git commit -m "feat: refresh app shell and navigation"
```

### Task 4: Explorer and task detail

**Files:**
- Create: `src/components/task-explorer.tsx`
- Create: `src/components/task-card.tsx`
- Create: `src/components/task-run-browser.tsx`
- Create: `src/app/tasks/[task]/page.tsx`
- Create: `tests/components/task-explorer.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/components/run-visual.tsx`

**Interfaces:**
- `TaskExplorer({ cards })` performs client-side task/model search.
- `TaskCard({ card })` links to
  `` `/tasks/${encodeURIComponent(card.task)}` ``.
- `TaskRunBrowser({ task, prompt, runs, initialRunId })` switches the active run.
- Existing `RunVisual` remains the only public preview renderer.

- [ ] **Step 1: Write the failing Explorer interaction test**

```tsx
it("filters task cards by task or model and keeps counts visible", async () => {
  const user = userEvent.setup();
  render(<TaskExplorer cards={[
    { task: "gmail-clone", runCount: 9, modelCount: 6, models: ["claude-sonnet-5"], representativeRunId: "gmail" },
    { task: "figma-clone", runCount: 4, modelCount: 3, models: ["gpt-5.6-sol"], representativeRunId: "figma" }
  ]} />);
  await user.type(screen.getByRole("searchbox"), "sonnet");
  expect(screen.getByRole("link", { name: /Gmail clone/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Figma clone/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- tests/components/task-explorer.test.tsx`

Expected: FAIL because Explorer components are missing.

- [ ] **Step 3: Implement the Explorer**

The home page renders totals from the card list, a French headline, one
searchbox, a freshness warning only when present, responsive visual task cards,
and an explicit no-results state. Use the representative run's preview route as
a non-interactive card thumbnail; set `tabIndex={-1}` and
`pointer-events:none` on card iframes so the card link remains the single action.

- [ ] **Step 4: Implement task detail and legacy redirect**

`/tasks/[task]` resolves the decoded exact task, calls `notFound()` for an
unknown task, fetches the canonical prompt through the existing safe reader, and
renders `TaskRunBrowser`. The comparison CTA is:

```tsx
<Link href={`/compare?task=${encodeURIComponent(task)}`}>Comparer deux modèles</Link>
```

Replace `/tasks` with a permanent redirect to `/`.

- [ ] **Step 5: Verify Explorer and preview behavior**

Run: `pnpm test -- tests/components/task-explorer.test.tsx tests/components/run-visual.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/app/tasks/page.tsx 'src/app/tasks/[task]/page.tsx' src/components/task-explorer.tsx src/components/task-card.tsx src/components/task-run-browser.tsx src/components/run-visual.tsx tests/components/task-explorer.test.tsx
git commit -m "feat: build task-first explorer"
```

### Task 5: Focus-alternated comparison workbench

**Files:**
- Create: `src/components/compare-workbench.tsx`
- Create: `src/components/run-metadata-grid.tsx`
- Create: `tests/components/compare-workbench.test.tsx`
- Modify: `src/app/compare/page.tsx`
- Delete: `src/components/cost-score-chart.tsx`

**Interfaces:**
- `CompareWorkbench({ selection })` updates `task`, `left`, and `right` query parameters through `router.replace`.
- `RunMetadataGrid({ left, right })` aligns known values without zero-filling.
- Consumes `ComparisonSelection` from Task 2 and `RunVisual`.

- [ ] **Step 1: Write the failing focus-switch test**

```tsx
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

it("shows one large preview and alternates focus between selected runs", async () => {
  const user = userEvent.setup();
  render(<CompareWorkbench selection={readySelection} />);
  expect(screen.getByTitle("Visual result for left-run")).toBeInTheDocument();
  expect(screen.queryByTitle("Visual result for right-run")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Modèle B/ }));
  expect(screen.getByTitle("Visual result for right-run")).toBeInTheDocument();
});
```

- [ ] **Step 2: Write the failing same-task selector test**

```tsx
it("only offers models and run versions from the selected task", () => {
  render(<CompareWorkbench selection={readySelection} />);
  expect(screen.getByRole("option", { name: "model-a" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "other-task-model" })).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the tests and verify missing-component failures**

Run: `pnpm test -- tests/components/compare-workbench.test.tsx`

Expected: FAIL because the workbench is missing.

- [ ] **Step 4: Implement selectors and URL state**

Render task, model A, model B, and conditional run-version selectors. Keep model
selections distinct. Use `router.replace` with `scroll: false` and preserve only
valid task/left/right values.

- [ ] **Step 5: Implement Preview, Details, and Code tabs**

Preview defaults to A and has A/B controls with `aria-pressed`. Split view uses
two `RunVisual` instances but is hidden below `lg`. Details uses aligned labels:
Model, Harness, Status, Date, Score, Cost, Duration, Tokens. Code links to
`resultPath` and `previewPath`; it does not fetch arbitrary source files.

- [ ] **Step 6: Add empty states**

Render distinct French messages for `no-tasks` and `not-enough-models`. Do not
render disabled or empty selectors that imply comparison is possible.

- [ ] **Step 7: Run comparison tests and regression tests**

Run: `pnpm test -- tests/components/compare-workbench.test.tsx tests/tasks/view-model.test.ts tests/components/run-visual.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/compare/page.tsx src/components/compare-workbench.tsx src/components/run-metadata-grid.tsx tests/components/compare-workbench.test.tsx
git rm src/components/cost-score-chart.tsx
git commit -m "feat: compare two runs on one task"
```

### Task 6: Single-source cleanup, run polish, and public verification

**Files:**
- Modify: `src/app/runs/page.tsx`
- Modify: `src/app/runs/[id]/page.tsx`
- Modify: `src/components/run-table.tsx`
- Modify: `README.md`
- Delete: `src/app/sources/page.tsx`
- Delete: `src/components/source-status-card.tsx`
- Delete: `src/components/metric-card.tsx`
- Delete: `src/lib/sources/adapters/akita.ts`
- Delete: `src/lib/sources/adapters/agentlens.ts`
- Delete: `src/lib/sources/adapters/codescalebench.ts`
- Delete: `src/lib/sources/adapters/pyros.ts`
- Delete: `src/lib/sources/adapters/swebench.ts`
- Delete: `src/lib/sources/adapters/tinybird.ts`
- Modify: `src/lib/sources/registry.ts`
- Modify: `tests/sources/adapters.test.ts`

**Interfaces:**
- Keeps only the Melvynx adapter and source.
- Keeps `/runs` and `/runs/[id]` compatible with merged imported runs.
- Removes all public and internal multi-source UI claims.

- [ ] **Step 1: Tighten the source contract test**

Replace the adapter matrix with:

```ts
it("configures and registers only Melvynx", () => {
  expect(benchmarkSources.map((source) => source.id)).toEqual(["melvynx-benchmarks"]);
  expect(getAdapter("melvynx")).toBe(melvynxAdapter);
});
```

- [ ] **Step 2: Run the source test before cleanup**

Run: `pnpm test -- tests/sources/adapters.test.ts`

Expected: FAIL because additional sources remain configured.

- [ ] **Step 3: Remove unused sources and adapters**

Delete only the six non-Melvynx adapters listed above. Keep shared adapter
utilities and all Melvynx fixtures/tests. Simplify the registry to:

```ts
export const adapterRegistry = { melvynx: melvynxAdapter };
```

- [ ] **Step 4: Polish run inventory and detail**

Remove the Source filter/column from the run table. Prioritize Task, Model,
Harness, Preview availability, Status, and Date. Keep unknown values as `—`.
Update the detail page breadcrumbs and card styling to match Explorer.

- [ ] **Step 5: Remove dead multi-source UI and update README**

Delete Sources, old metric/scatter components, and multi-source instructions.
Document Explorer, same-task comparison, public Melvynx provenance, and the
bundled-snapshot/live-import overlay.

- [ ] **Step 6: Run the complete public-app gate**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: every command exits 0 with no warnings introduced by this plan.

- [ ] **Step 7: Commit**

```bash
git add README.md src tests
git commit -m "refactor: focus the hub on Melvynx runs"
```
