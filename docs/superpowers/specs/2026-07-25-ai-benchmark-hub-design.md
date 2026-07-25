# AI Benchmark Hub — Design

## Goal

Build a local web application that aggregates publicly available AI and coding-agent benchmark results from approved GitHub repositories, normalizes them, caches them locally, and makes them easy to inspect and compare. The application never forks source repositories, executes their code, or reads secrets.

## MVP decisions

- **Framework:** Next.js with the App Router, TypeScript, Tailwind CSS, and shadcn/ui.
- **Persistence:** JSON files under `.cache/benchmark-hub/`. SQLite is explicitly deferred until cache volume or querying needs justify it.
- **Data access:** GitHub REST API plus raw GitHub URLs, using an optional `GITHUB_TOKEN` only for rate-limit headroom. No cloning is required.
- **Branching:** all changes land on `feature/ai-benchmark-hub` as small feature commits, then are merged into `main` after verification.

## Safety boundary

Every GitHub request is constrained by a source configuration entry and an allowlist of text/data file patterns. The client rejects paths outside that allowlist and ignores binary, ignored, credential, and executable files. It only fetches known text formats (JSON, JSONL, YAML, Markdown, CSV, and small HTML previews) and parses them as data. It never invokes scripts, package managers, or any code from external repositories.

## Source configuration and adapter contract

`src/lib/sources/config.ts` contains the seven initial repositories, branch, adapter key, enabled flag, and per-source path allowlists. `src/lib/sources/types.ts` defines `NormalizedRun`, sync outcomes, safe remote-file metadata, and the adapter interface.

`src/lib/sources/registry.ts` maps adapter keys to isolated adapter modules in `src/lib/sources/adapters/`. An adapter receives only its configured source and safe GitHub reader. It returns normalized runs and warnings; an adapter exception is captured in its source report so the overall synchronization continues.

Each `NormalizedRun` uses the user-supplied model unchanged, preserving unavailable values as `null` and all parser inputs or relevant source fragments in `raw` for diagnosis.

## Synchronization and cache

`scripts/sync.ts` accepts `pnpm sync`, `pnpm sync --source <source-id>`, and `pnpm sync --force`. The sync service:

1. loads enabled configured sources (or the selected one);
2. lists and reads only allowlisted files using GitHub APIs;
3. invokes the matching adapter;
4. atomically writes normalized runs and source metadata to `.cache/benchmark-hub/`;
5. writes `.cache/benchmark-hub/sync-report.json` containing per-source state (`success`, `partial`, or `failed`), counts, timestamps, and safe error text.

The UI reads this local cache only. A source sync action calls a local route handler that performs the same safe sync flow and returns the updated source report.

## Adapter scope

The initial adapters follow these repository-specific inputs:

- `melvynx`: `transcripts.json`, `runs/**/data/**/metadata.json`, and allowed benchmark `index.html` previews.
- `akita`: `docs/report.md`, `results/**/result.json`, and listed logs.
- `codescalebench`: snapshot JSON plus allowed summary and trace exports.
- `swebench`: evaluation metadata and prediction files; logs/trajectories remain source links.
- `tinybird`: benchmark results, validation results, and configuration JSON.
- `pyros`: approved `EVALUATION.md` files and related report/screenshot paths.
- `agentlens`: leaderboard CSV and approved report/output files.

Markdown parsers make conservative best-effort records when structured result files are absent. Links in normalized runs use GitHub blob URLs, and transcript contents are fetched only when a text file is below a defined size limit; otherwise the UI exposes a link.

## UI

The application has a persistent navigation header and a methodology-warning banner explaining that repositories do not share a common methodology.

- `/`: metric cards for parsed runs, active sources, known total cost, unique models/tasks, and last synchronization.
- `/sources`: source cards/table with repository, sync status, run count, last error, and an individual “Sync source” action.
- `/runs`: searchable, filterable, sortable run table. It covers source, model, provider, harness, task, status, score, duration, cost, tokens, and creation date.
- `/runs/[id]`: normalized metadata, available GitHub source links, expandable raw JSON, and bounded transcript display.
- `/compare`: per-model aggregates for known scores, costs, durations, and run counts; a cost-vs-score scatter plot; and score-per-cost best-value table.

Unknown values display as `—`; the UI never substitutes made-up values or converts absence into zero.

## Testing and verification

Vitest tests cover status normalization, nested numeric cost/token extraction, conservative Markdown parsing, and one local fixture-driven test for each adapter. Fixtures live under `tests/fixtures/` and never access the network. The delivery gate is `pnpm test`, `pnpm lint`, and `pnpm typecheck`, followed by a production build check.

## Documentation

`README.md` will describe installation, optional `GITHUB_TOKEN` configuration without exposing a credential, development, synchronization commands, adding a source/configured adapter, the no-execution safety model, and methodology limitations.
