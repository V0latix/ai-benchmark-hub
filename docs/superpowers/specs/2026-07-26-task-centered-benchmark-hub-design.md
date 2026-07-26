# Task-Centered Benchmark Hub — Design

## Goal

Reorganize AI Benchmark Hub around the runs published by
`Melvynx/benchmarks`, make task-level exploration fluid, compare two models on
the same task, and let one administrator import a downloaded LM Arena project,
preview it, validate it, and publish it for every visitor.

## Product decisions

- `Melvynx/benchmarks` is the only public source of truth.
- Every task, run, metadata file, and preview artifact already present in
  `Melvynx/benchmarks` is immutable; imports may only add previously unused
  paths and append a new manifest entry.
- Every visitor can browse every published task and run without an account.
- Only the administrator can import and publish a run.
- The administrator signs in with one server-configured password. User accounts
  and account management are out of scope.
- The app is deployed on Vercel.
- An imported LM Arena archive is reviewed in an interactive preview before it
  is published.
- Model comparison always starts with one task and two distinct runs from that
  task.
- The primary comparison interaction is an alternating full-size preview. A
  secondary split view is available on sufficiently wide screens.
- Adding new benchmark sources, public submissions, voting, scoring, and
  automated judging are out of scope.

## Information architecture

The application navigation contains four destinations:

1. **Explorer** is the new home page. It replaces the current metric-only home
   and the separate task browser. It shows a searchable task library with a
   representative preview, run count, and model count for each task.
2. **Comparer** opens task-scoped model comparison. The selected task can also
   be carried in from Explorer.
3. **Tous les runs** keeps the dense searchable run inventory for diagnosis and
   direct access to run details.
4. **Admin · Ajouter un run** opens the protected import flow.

The multi-source status page and the persistent cross-methodology warning are
removed. Repository provenance remains available in run details.

## Explorer and task detail

Explorer leads with a short statement, total task/run counts, and one search
field that matches task and model names. Task cards prioritize visuals over
aggregate metrics. Selecting a card opens `/tasks/[task]`.

The task detail page contains:

- the canonical task name and prompt;
- an external link to the canonical prompt;
- a compact list of available models and runs;
- one large interactive preview for the active run;
- the run's model, harness, publication date, and direct detail link;
- a primary “Comparer deux modèles” action carrying the task into comparison.

Unknown values render as `—`. The interface does not infer scores, costs, dates,
or other missing measurements.

## Task-scoped comparison

The comparison route stores `task`, `left`, and `right` run IDs in query
parameters so a comparison can be shared and restored.

The selection order is:

1. choose a task;
2. choose model A and model B from models that have a run for that task;
3. when a model has multiple runs, use its most recent run by default and expose
   a secondary run-version selector.

The same run cannot occupy both sides. Changing the task clears incompatible
run selections. Empty and one-model tasks explain why comparison is unavailable.

The comparison body has Preview, Details, and Code tabs:

- **Preview** displays one large interactive preview and an A/B segmented
  control. The inactive model remains visible as a compact summary. A split-view
  control appears on wide screens.
- **Details** aligns known metadata fields row by row without manufacturing
  missing values.
- **Code** links to the corresponding public repository artifact and exposes
  bounded, safe text previews where supported.

On mobile, alternating focus remains the only preview mode.

## Admin authentication

The app uses `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` Vercel environment
variables. The administrator generates the password hash locally; the plaintext
password is never stored in Vercel. Login happens only through a server route.
Password verification derives and compares fixed-length values in constant
time. A successful login creates a short-lived, signed, HTTP-only, secure,
SameSite=Strict session cookie.

Every import, draft, preview, cancel, and publish endpoint verifies the session.
Mutation requests also require a same-origin request and a per-session CSRF
token. Login attempts receive basic rate limiting. Secrets are never included in
client bundles, logs, API responses, repository files, or run metadata.

## Import flow

The import wizard has four steps:

1. **Identifier le run** — select an existing canonical task, enter the model
   name, select or confirm `lmarena` as the harness, choose the downloaded ZIP,
   and optionally provide generation time and a short note.
2. **Valider l’archive** — inspect the archive in the administrator's browser
   without executing project code, derive a unique run ID and application slug,
   and report supported entry points, detected framework, file counts, size,
   and warnings. The server independently validates every extracted file before
   accepting it.
3. **Prévisualiser** — upload each sanitized file separately through bounded
   server requests, assemble the signed file receipts into a temporary GitHub
   draft branch, and render it through the existing sandboxed preview pipeline.
   Display the exact metadata that will be published.
4. **Publier** — create one atomic commit on the latest `main`, update the
   imported-runs manifest, remove the temporary branch, revalidate application
   data, and link to the new public run.

The browser retains the entered metadata between validation errors. The publish
button is enabled only after successful archive validation and an interactive
preview load.

## Supported archives and safety

The first release supports:

- a built static site containing `index.html` plus relative CSS, JavaScript,
  image, and font assets;
- a Vite-style React project containing `index.html`, `package.json`, and a
  conventional `src/main.jsx` or `src/main.tsx` entry that the existing preview
  runtime can serve without installing or executing dependencies.

The server never runs `npm`, a package manager, a build script, a shell command,
or uploaded executable code. It treats the archive as untrusted data.

Archive validation rejects:

- uploads larger than 20 MB compressed or 75 MB expanded;
- more than 1,000 files or a single file larger than 3 MB;
- absolute paths, `..` traversal, ambiguous normalized paths, symlinks, device
  files, nested archives, and excessive compression ratios;
- `.env` files, credential and key filenames, browser profiles, source maps,
  server-side executables, and unsupported binary formats;
- projects without a supported entry point;
- package dependencies the safe preview runtime cannot resolve.

Accepted content is limited to required project text plus common web images and
fonts. File names and text metadata are normalized before publication. Browser
inspection is only an early usability check: the server repeats path, size,
type, secret-name, and text-content validation for every extracted file. This
chunked file protocol keeps every request below Vercel's 4.5 MB function body
limit without adding another storage service. The interactive preview remains
in a sandboxed iframe with the existing restrictive CSP, storage shim, bounded
file access, and no form submission.

## GitHub draft and publication protocol

`BENCHMARK_GITHUB_TOKEN` is a fine-grained GitHub token with contents read/write
access only to `Melvynx/benchmarks`. The app never accepts a repository name,
owner, or branch from the client.

Each accepted file is written as a Git blob and returns a signed receipt binding
its draft ID, normalized path, blob SHA, size, and content type. Finalization
rejects missing, duplicate, invalid, expired, or cross-draft receipts and
rechecks aggregate limits and required entry points. It then creates
`imports/<draft-id>` from the latest `main` using only those verified blobs. The
app returns a signed draft identifier, not an arbitrary Git ref. Draft preview
routes accept only that signed identifier and the active admin session.

`Melvynx/benchmarks` is public, so a temporary draft branch is technically
readable by someone who already knows its unpredictable name even though the app
does not index or expose it. The wizard states this before upload, validation
rejects likely secrets, and canceled or stale drafts are removed. A private draft
storage service is intentionally deferred to avoid introducing a second
persistence system.

Publishing reads the current `main` again, creates a new tree containing the
draft artifact, run metadata, and manifest update, and creates one new commit.
It rejects any run ID, application slug, metadata path, or artifact path that
already exists on `main`; it never replaces an existing task or run file.
It then advances `main` only when the expected parent still matches. If `main`
changed, publication rebuilds against the new head and retries once. It never
force-pushes.

The published repository paths are:

```text
runs/<run-id>/data/<task>/metadata.json
benchmarks/<task>/<app-slug>/...
imports/index.json
```

Metadata remains compatible with the current Melvynx adapter and includes
`run_id`, `task`, `model`, `harness`, `status`, `app_name`, `type`,
`created_at`, and optional notes. `sourceId` remains
`melvynx-benchmarks`; LM Arena is recorded as the harness/origin, not as another
benchmark source.

Canceling a draft removes its temporary branch. Failed publication keeps the
draft available for retry and does not change `main`. Drafts older than 24 hours
are removed opportunistically during later authenticated admin activity.

## Public data loading

The bundled Melvynx snapshot remains the offline and development baseline.
Production reads the small public `imports/index.json` overlay through a cached
server data loader and merges imported runs by stable ID. The import manifest is
the only additional live read needed for normal pages.

After publication, the server invalidates the Melvynx-import cache tag and the
affected task/run paths. A newly published run therefore appears without a full
Vercel redeploy. If live manifest loading fails, the app shows the last cached
public data and a non-blocking freshness notice instead of losing existing runs.

## Visual system and interaction quality

The dark visual direction remains, but the UI gains:

- a clearer type scale and hierarchy;
- a constrained content width and consistent spacing rhythm;
- large preview-first task cards;
- sticky controls only where they shorten repeated actions;
- compact skeleton states for live data;
- explicit empty, loading, failure, and success states;
- visible keyboard focus, semantic labels, and sufficient contrast;
- responsive layouts that preserve the same task-first mental model.

Animations are limited to short opacity and position transitions for selectors,
drawers, and focus changes. The app respects reduced-motion preferences.

## Error handling

- Authentication failures return a generic message and never reveal which
  secret check failed.
- Archive errors identify the offending path or violated limit without echoing
  file contents.
- Unsupported projects explain the accepted archive shapes.
- A failed preview keeps the draft and metadata editable.
- A GitHub conflict retries once against the new `main`; a second conflict
  leaves the draft retryable.
- A failed branch cleanup is reported as a warning after successful publication
  and can be retried without duplicating the public run.
- Manifest entries are validated before merge. One invalid imported entry is
  skipped and surfaced as a freshness warning rather than breaking the app.

## Testing and delivery

Vitest coverage includes:

- task/run grouping, search, default comparison selection, incompatible
  selection clearing, and manifest overlay merging;
- ZIP limits, traversal, symlink and secret-file rejection, supported entry
  detection, slug/run ID derivation, and metadata generation;
- session signing/expiry, constant-time password validation, CSRF checks, and
  login throttling;
- GitHub draft creation, atomic publish, conflict retry, cancellation, stale
  cleanup, and failure behavior using an in-memory GitHub transport;
- Explorer, task detail, focus-alternated comparison, and import wizard
  component behavior.

Verification requires `pnpm test`, `pnpm lint`, `pnpm typecheck`, and
`pnpm build`. Manual verification covers desktop/mobile layout, keyboard-only
navigation, reduced motion, a static LM Arena archive, a Vite React archive, a
rejected malicious archive, a failed GitHub publish followed by retry, and
public visibility of a newly published run.
