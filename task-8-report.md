# Task 8 — Four-step admin import wizard

## Outcome

Implemented the complete French admin import flow:

1. select an existing task, enter a trimmed model, keep `lmarena` fixed, and optionally set generation time and notes;
2. inspect a ZIP locally through the shared archive policy and disclose the technically public temporary branch;
3. upload raw files with at most three concurrent requests, exact server headers, CSRF, progress, retained successful receipts, failed-file retry, finalization, and a sandboxed preview;
4. require the preview `load` event before publication, retain the signed draft on publish failure, support retry/cancel, and show public links plus cleanup/cache warnings on success.

Session expiry and logout remove archive bytes, receipts, and draft tokens from
local state. An operation-generation guard prevents late responses from
restoring uploads after logout. Successful publication also clears all archive
and receipt state.

## TDD evidence

- Initial wizard suite: 9/9 tests failed because the placeholder exposed no form.
- Main green cycle: 9/9 tests passed.
- Added logout race regression: observed one late upload request before the
  operation guard, then 10/10 wizard tests passed after the fix.
- Targeted admin gate: 15/15 tests passed across the wizard, login, and protected page.

All fetches are mocked in component tests; the suite performs no network calls.

## Verification

Fresh delivery gate:

```text
pnpm test       44 files, 253 tests passed
pnpm lint       passed
pnpm typecheck  passed
pnpm build      passed
```

The build emits the pre-existing Next.js multi-lockfile workspace-root warning;
compilation, TypeScript, page generation, and route collection all complete
successfully.

`git diff --check` passed. No credential or secret value was added.

## Files

- `src/components/admin-import-wizard.tsx`
- `src/components/import-dropzone.tsx`
- `src/components/import-preview.tsx`
- `src/app/admin/import/page.tsx`
- `tests/components/admin-import-wizard.test.tsx`
- `tests/app/admin-import-page.test.tsx`
- `tests/components/run-table.test.ts` (adds missing React cleanup required for a pristine full-suite gate)
