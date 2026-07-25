# AI Benchmark Hub

Local web dashboard that aggregates public AI and coding-agent benchmark data from approved GitHub repositories. It reads allowlisted text/data files only, normalizes results, caches them locally, and provides source, run, and model-comparison views.

## Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The app has no user authentication.

## Synchronize sources

```bash
pnpm sync
pnpm sync --source melvynx-benchmarks
pnpm sync --force
```

The resulting runs are cached in `.cache/benchmark-hub/runs.json`; per-source status, warnings, and failures are written to `.cache/benchmark-hub/sync-report.json`.

For higher GitHub API rate limits, add a token locally without committing it:

```bash
export GITHUB_TOKEN="your_token_here"
```

## Add a source

1. Add a `BenchmarkSource` entry in `src/lib/sources/config.ts`, including its exact repository, branch, adapter key, and restrictive allowlist.
2. Create an isolated parser in `src/lib/sources/adapters/` that uses only the supplied safe reader.
3. Register the adapter in `src/lib/sources/registry.ts`.
4. Add a local fixture-driven test in `tests/sources/`.

## Safety model

The app never forks or clones sources, and it never runs source-repository code. GitHub requests are restricted to configured repositories and allowed paths; credential-like names, hidden environment files, traversal paths, binaries, and unrestricted remote paths are rejected. Every adapter keeps the parsed source material in `raw` for debugging.

## Methodology limits

Repositories use different prompts, tasks, evaluation harnesses, versions, and scoring rules. A missing metric remains unknown (`null` / `—`), never zero or inferred. Cross-repository comparisons are informative but require methodological judgment.
