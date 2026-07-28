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

## Configure private imports

Only the administrator can add runs. Public visitors can still browse every
task, run, visual, and comparison without an account.

Generate the administrator password hash locally:

```bash
pnpm admin:hash-password
```

The command hides the password while it is entered, prints only its encoded
scrypt hash, and never edits an environment file. Copy `.env.example` to a
local environment file and replace all three deliberately invalid values:

- `ADMIN_PASSWORD_HASH`: the complete output of the command above;
- `ADMIN_SESSION_SECRET`: at least 32 random bytes from a password manager or
  cryptographic generator;
- `BENCHMARK_GITHUB_TOKEN`: a GitHub fine-grained personal access token.

Never paste these values into an issue, log, chat, or test, and never commit
them. On GitHub, create a fine-grained token restricted to the single
`Melvynx/benchmarks` repository. Grant only repository permission
**Contents: Read and write**. Do not grant account-wide or organization-wide
access.

In Vercel, add `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and
`BENCHMARK_GITHUB_TOKEN` to the intended project environments, then redeploy.
Keep the public app readable without authentication; `/admin/import` and its
mutation endpoints remain administrator-only.

## Import LM Arena output

Download the generated code from LM Arena as a ZIP, then open
`/admin/import`. The wizard lets you choose an existing Melvynx task, enter the
model name, inspect the archive, upload it to a draft, preview it in a sandbox,
and explicitly publish it.

Imports accept supported static projects and Vite React projects with their
required entry files. Each ZIP is limited to 20 MB compressed, 75 MB expanded,
1,000 total entries, 750 kB per text file, and 3 MB per binary file. Traversal
paths, symlinks, nested archives, secret-like files, source maps, executables,
and unsupported binaries are rejected before upload.

Draft branches are unlisted but technically public in the public
`Melvynx/benchmarks` repository until they are canceled or published. Do not
include private information in an archive.

Admin previews remain in an opaque `sandbox="allow-scripts"` iframe. Their
five-minute `__Secure-benchmark_preview` cookie is `HttpOnly`, `Secure`,
`SameSite=None`, has no `Domain`, and is scoped to the exact draft visual path;
the administrator session cookie remains `SameSite=Strict`. `SameSite=None`
is required because browsers classify module requests from the opaque iframe
as cross-site: Chrome testing confirmed that both `SameSite=Strict` and a
top-level-set `Partitioned` cookie are withheld from that module graph.
Credentialed preview CORS is therefore limited to the opaque `Origin: null`,
while the CSP keeps `frame-ancestors 'self'` and no capability appears in a
document or resource URL.

Development and automated tests must use `InMemoryGitWriter`, which exercises
the import and publication flow without publishing or making a real GitHub
write. Run the relevant mocked tests before deployment:

```bash
pnpm test -- tests/imports tests/components/admin-import-wizard.test.tsx
```

Exercise real publication only when explicitly intended, from a configured
administrator session, with the repository-scoped token above. Never point a
development or test writer at the real repository merely to verify the UI.

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
