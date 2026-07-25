# AI Benchmark Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a local Next.js dashboard that safely retrieves, normalizes, caches, and compares public AI benchmark data from seven GitHub repositories.

**Architecture:** A typed synchronization core reads only configured, allowlisted text files through GitHub APIs and dispatches isolated adapters. JSON cache files hold normalized runs and source reports; pages read that cache and route handlers trigger safe single-source syncs.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, Vitest, Zod, Recharts, pnpm.

## Global Constraints

- Do not fork or clone a source repository.
- Do not execute external code or access secrets, credentials, ignored files, or arbitrary remote paths.
- Fetch only allowed JSON, JSONL, YAML, Markdown, CSV, and size-bounded HTML.
- Use JSON cache files below `.cache/benchmark-hub/`; do not add SQLite in this MVP.
- Keep all adapters in `src/lib/sources/adapters/`; a failure must not stop another source.
- Preserve missing metrics as `null`, display them as `—`, and retain parsing inputs in `NormalizedRun.raw`.
- Commit each task separately on `feature/ai-benchmark-hub`, push it, and merge to `main` only after release verification.

---

## File structure

```text
src/app/{page.tsx,sources/page.tsx,runs/page.tsx,runs/[id]/page.tsx,compare/page.tsx}
src/app/api/sources/[sourceId]/sync/route.ts
src/components/{app-shell,metric-card,source-status-card,run-table,json-viewer,cost-score-chart}.tsx
src/lib/github/{client,paths,cache}.ts
src/lib/normalize/{status,numbers,dates,markdown}.ts
src/lib/sources/{config,types,registry,sync}.ts
src/lib/sources/adapters/{shared,melvynx,akita,codescalebench,swebench,tinybird,pyros,agentlens}.ts
src/lib/storage/{json-store,queries}.ts
scripts/sync.ts
tests/{normalize,github,storage,sources,components}/**/*.test.ts
tests/fixtures/<adapter>/*
```

### Task 1: Create the typed Next.js foundation and normalization primitives

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, Tailwind configuration, `src/app/{layout,page,globals}.tsx`, `src/lib/sources/types.ts`, `src/lib/normalize/{status,numbers,dates,markdown}.ts`, and `tests/normalize/{status,numbers,markdown}.test.ts`.

**Interfaces:** Define the full requested `NormalizedRun`, `RunStatus`, `SourceSyncState`, and `SourceSyncReport`; export `normalizeStatus`, `findNumber`, `parseDate`, and `parseMarkdownFacts` for all subsequent tasks.

- [ ] **Step 1: Write the failing tests.**

```ts
it("normalizes timeout-like statuses", () => expect(normalizeStatus("TIMED OUT")).toBe("timeout"));
it("finds nested dollar cost but retains absence", () => {
  expect(findNumber({ usage: { total_cost_usd: "$1.25" } }, ["total_cost_usd"])).toBe(1.25);
  expect(findNumber({}, ["total_cost_usd"])).toBeNull();
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/normalize`; expected failure: imports/modules do not exist.
- [ ] **Step 3: Implement minimal pure functions and the app/tool configuration.** Use `null`, never `0`, for unavailable values.
- [ ] **Step 4: Verify green.** Run `pnpm test && pnpm lint && pnpm typecheck`; expected exit 0.
- [ ] **Step 5: Commit and push.** `git add package.json pnpm-lock.yaml src tests '*.config.*' && git commit -m "feat: scaffold benchmark hub foundation" && git push`

### Task 2: Add explicit source configuration, safe GitHub reader, and JSON cache

**Files:** Create `src/lib/sources/config.ts`, `src/lib/github/{client,paths,cache}.ts`, `src/lib/storage/{json-store,queries}.ts`, `tests/github/paths.test.ts`, and `tests/storage/json-store.test.ts`; modify `src/lib/sources/types.ts`.

**Interfaces:** Export the seven required source entries, each with branch, adapter, enabled state, and file-pattern allowlist. Export `isAllowedPath(source,path)`, `GitHubReader.listFiles/readText`, `readCache`, `writeCache`, and `getSyncReport`. Limit `readText` to `750_000` UTF-8 bytes.

- [ ] **Step 1: Write failing safety/cache tests.**

```ts
it("rejects credentials and unlisted paths", () => {
  expect(isAllowedPath(source, ".env")).toBe(false);
  expect(isAllowedPath(source, "runs/a/data/metadata.json")).toBe(true);
});
it("round-trips cache atomically", async () => {
  await writeCache({ runs: [fixtureRun], report: fixtureReport });
  expect(await readCache()).toMatchObject({ runs: [fixtureRun] });
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/github/paths.test.ts tests/storage/json-store.test.ts`.
- [ ] **Step 3: Implement allowlist glob matching, GitHub Contents/tree reads with optional `GITHUB_TOKEN`, and temp-file/rename cache writes.** Reject hidden credential names even if a configuration error permits them.
- [ ] **Step 4: Verify green.** Run focused tests, then `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit and push.** `git add src/lib/sources src/lib/github src/lib/storage tests/github tests/storage && git commit -m "feat: add safe GitHub reader and JSON cache" && git push`

### Task 3: Implement sync orchestration plus Melvynx, Akita, and CodeScaleBench adapters

**Files:** Create `src/lib/sources/{registry,sync}.ts`, `src/lib/sources/adapters/{shared,melvynx,akita,codescalebench}.ts`, `tests/sources/adapters/{melvynx,akita,codescalebench}.test.ts`, and fixtures in the matching `tests/fixtures/` directories.

**Interfaces:** Define `AdapterContext`, `AdapterResult`, and `syncSources(options)`. An adapter returns `{ runs, warnings }`; an exception becomes a per-source `failed` report while synchronization continues.

- [ ] **Step 1: Write one fixture-driven failing test per adapter.**

```ts
it("extracts Melvynx metadata and preview links", async () => {
  expect((await melvynxAdapter(fixtureContext("melvynx"))).runs[0])
    .toMatchObject({ model: "gpt-5", totalCostUsd: 0.42, status: "success" });
});
it("creates an Akita record from report markdown without result.json", async () => {
  expect((await akitaAdapter(fixtureContext("akita"))).runs).toHaveLength(1);
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/sources/adapters/melvynx.test.ts tests/sources/adapters/akita.test.ts tests/sources/adapters/codescalebench.test.ts`.
- [ ] **Step 3: Implement shared `makeRun` defaults and the three adapters.** Melvynx reads transcripts/metadata/previews; Akita uses report/result/log paths; CodeScaleBench uses snapshots/summaries/traces. All reads must use allowlisted paths through `GitHubReader`.
- [ ] **Step 4: Implement report persistence and run full validation.** Run `pnpm test && pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit and push.** `git add src/lib/sources tests/sources tests/fixtures && git commit -m "feat: sync Melvynx Akita and CodeScaleBench data" && git push`

### Task 4: Implement SWE-bench, Tinybird, Pyros, and AgentLens adapters

**Files:** Create `src/lib/sources/adapters/{swebench,tinybird,pyros,agentlens}.ts`, their four adapter test files, and their local fixtures; modify `registry.ts` and `config.ts`.

**Interfaces:** Each module consumes Task 3’s `AdapterContext` and emits its `AdapterResult`. SWE-bench emits submission-level entries and keeps logs/trajectories only as GitHub paths, never as downloaded contents.

- [ ] **Step 1: Write four failing fixture tests.**

```ts
it("creates one SWE-bench submission run", async () => {
  expect((await swebenchAdapter(fixtureContext("swebench"))).runs[0].runId).toBe("submission-1");
});
it("maps AgentLens CSV score to a normalized run", async () => {
  expect((await agentlensAdapter(fixtureContext("agentlens"))).runs[0].score).toBe(0.78);
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/sources/adapters/{swebench,tinybird,pyros,agentlens}.test.ts`.
- [ ] **Step 3: Implement conservative parsers.** Tinybird reads three benchmark JSON files; Pyros parses allowed evaluation Markdown plus report/screenshot paths; AgentLens parses CSV and allowed report outputs. Use `null` for every unavailable metric.
- [ ] **Step 4: Verify green.** Run `pnpm test && pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit and push.** `git add src/lib/sources tests/sources tests/fixtures && git commit -m "feat: add remaining benchmark adapters" && git push`

### Task 5: Add CLI synchronization and a source-sync route

**Files:** Create `scripts/sync.ts`, `src/app/api/sources/[sourceId]/sync/route.ts`, and `tests/sources/sync.test.ts`; modify `package.json` and `src/lib/sources/sync.ts`.

**Interfaces:** `pnpm sync`, `pnpm sync --source <id>`, and `pnpm sync --force` call `syncSources` and write `.cache/benchmark-hub/sync-report.json`. `POST /api/sources/:sourceId/sync` validates its source and returns its report or 404.

- [ ] **Step 1: Write a failing continuation-on-error test with injected adapters.**

```ts
it("records a failed source and continues", async () => {
  const report = await syncSources({ registry: { one: succeeds, two: fails } });
  expect(report.sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ sourceId: "two", status: "failed" }),
  ]));
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/sources/sync.test.ts`.
- [ ] **Step 3: Implement argument parsing and route validation.** Only accept known source IDs and `--force`; do not shell out or interpolate paths.
- [ ] **Step 4: Verify green.** Run `pnpm test && pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit and push.** `git add scripts src/app/api src/lib/sources package.json tests/sources && git commit -m "feat: add benchmark synchronization CLI" && git push`

### Task 6: Build the dashboard and source status pages

**Files:** Create `src/components/{app-shell,metric-card,source-status-card}.tsx`, `src/app/sources/page.tsx`, and their component tests; modify `layout.tsx`, `page.tsx`, and storage queries.

**Interfaces:** `getDashboardMetrics()` returns parsed run count, enabled-source count, known cost total, unique models/tasks, and last sync. `SourceStatusCard` renders source state/count/error and invokes only its source route.

- [ ] **Step 1: Write failing UI/query tests.**

```tsx
it("renders an em dash for unavailable cost", () => {
  render(<MetricCard label="Known cost" value={null} format="usd" />);
  expect(screen.getByText("—")).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/components/metric-card.test.tsx tests/components/source-status-card.test.tsx`.
- [ ] **Step 3: Implement dense responsive layout, metrics, source table, status badges, and the mandatory methodology warning.**
- [ ] **Step 4: Verify green.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm build`.
- [ ] **Step 5: Commit and push.** `git add src/app src/components src/lib/storage tests/components && git commit -m "feat: add dashboard and source status pages" && git push`

### Task 7: Build searchable runs and safe run details

**Files:** Create `src/components/{run-table,json-viewer}.tsx`, `src/app/runs/page.tsx`, `src/app/runs/[id]/page.tsx`, and focused query/component tests; modify storage queries.

**Interfaces:** `queryRuns(filters)` supplies source/model/status/harness/text filters and cost/score/date/duration sorts. `getRunById(id)` returns a run and size-bounded text transcript or `null`; otherwise detail view links to GitHub.

- [ ] **Step 1: Write failing query/table tests.**

```ts
it("sorts known costs descending while retaining unknown values", () => {
  expect(queryRuns({ sort: "cost-desc" }).map((run) => run.id)).toEqual(["expensive", "cheap", "unknown"]);
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/storage/queries.test.ts tests/components/run-table.test.tsx`.
- [ ] **Step 3: Implement URL-driven filters, sortable columns, JSON disclosure, normalized metadata, GitHub links, and transcript cutoff.**
- [ ] **Step 4: Verify green.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm build`.
- [ ] **Step 5: Commit and push.** `git add src/app/runs src/components src/lib/storage tests && git commit -m "feat: add searchable runs and detail views" && git push`

### Task 8: Build compare analytics, documentation, and final release merge

**Files:** Create `src/app/compare/page.tsx`, `src/components/cost-score-chart.tsx`, `README.md`, analytics/component tests; modify storage queries.

**Interfaces:** `getModelComparisons()` calculates averages only over observed values and computes best value only when score and strictly positive cost exist. `CostScoreChart` receives only points with both cost and score.

- [ ] **Step 1: Write failing comparison tests.**

```ts
it("excludes zero or unknown cost from best value", () => {
  expect(getModelComparisons(runs).bestValue.map((entry) => entry.model)).toEqual(["priced-model"]);
});
```

- [ ] **Step 2: Verify red.** Run `pnpm vitest run tests/storage/compare.test.ts tests/components/cost-score-chart.test.tsx`.
- [ ] **Step 3: Implement per-model averages, scatter chart, best-value table, and README.** README must cover install, token placeholder configuration, sync variants, development, adding sources/adapters, safety boundary, and methodology limits.
- [ ] **Step 4: Run the release gate and manually inspect fixture-cache pages.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm build`; then inspect `/`, `/sources`, `/runs`, and `/compare` with `pnpm dev`, stopping it afterward.
- [ ] **Step 5: Commit, push, and merge with fresh green evidence.**

```bash
git add README.md src/app/compare src/components src/lib/storage tests
git commit -m "feat: add benchmark comparison dashboard"
git push
git switch main
git merge --no-ff feature/ai-benchmark-hub -m "feat: launch AI Benchmark Hub MVP"
git push origin main
```

## Plan self-review

- Coverage: Tasks 1–5 implement the requested model, safe GitHub interaction, cache/report/CLI, and all seven isolated adapters. Tasks 6–8 implement every specified page, filtering, source action, visualization, warnings, README, and final merge.
- Placeholder scan: this document contains no `TBD`, deferred implementation marker, or unspecified test command.
- Type consistency: all adapters use the same `AdapterContext` and `AdapterResult`; UI uses `NormalizedRun` through storage queries; all sync entry points pass through `syncSources` and safe-path validation.
