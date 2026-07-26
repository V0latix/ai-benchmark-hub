# AI Benchmark Hub

AI Benchmark Hub is a public explorer for the runs published by
[Melvynx/benchmarks](https://github.com/Melvynx/benchmarks). Visitors can browse
tasks and interactive results without an account, then compare two distinct
models on the same task.

## Explore the benchmarks

- **Explorer** (`/`) is the task-first home page. Search tasks or models, open
  a representative visual result, and inspect the runs available for a task.
- **Comparer** (`/compare`) keeps its selection in the URL and only offers runs
  from the selected task. It alternates the full-size A/B preview and exposes
  metadata and public artifact links.
- **Tous les runs** (`/runs`) is the dense inventory for filtering by task,
  model, harness, and status. Ambiguous global run IDs are marked rather than
  linked to an arbitrary task.

Every public run has Melvynx provenance. LM Arena identifies a run harness or
origin when applicable; it is not a separate benchmark source.

## Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Public browsing requires
no sign-in.

## Data loading

The repository bundles a Melvynx snapshot for offline and development use. In
production, the app also reads the small public `imports/index.json` overlay
from `Melvynx/benchmarks` and validates its entries. The bundled snapshot is
authoritative: every bundled row, order, and content is preserved. Imported
runs use the task-qualified identity `[task,id]`; an exact identity never
overwrites its bundled run, while a new task-qualified identity appends to the
snapshot. If that live overlay cannot be refreshed, the bundled data remains
available and the Explorer shows a non-blocking freshness notice.

To refresh the local cache from the configured Melvynx repository:

```bash
pnpm sync
pnpm sync --force
```

The local cache is written to `.cache/benchmark-hub/` and is not required for
the bundled snapshot to render.

## Safety model

The app never forks or clones the benchmark repository, and it never executes
repository code. GitHub reads are restricted to Melvynx and its allowlisted
paths; credential-like names, hidden environment files, traversal paths,
binaries, and unrestricted remote paths are rejected. Missing measurements stay
unknown (`null` / `—`) rather than being inferred.
