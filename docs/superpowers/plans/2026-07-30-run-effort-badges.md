# Run Effort Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the Melvynx reasoning effort as a compact badge on every run card and as metadata for the active run.

**Architecture:** Keep the Melvynx snapshot unchanged and add a defensive presentation helper inside `TaskRunBrowser` that reads `raw.effort` only when it is a non-empty string. Reuse the extracted value in the run selector and active-run summary.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Do not rewrite or regenerate `src/data/melvynx-runs.snapshot.json`.
- Preserve existing selection, preview, detail-link, and ambiguous-run behavior.
- Render no badge for missing or malformed effort and render `—` in the active summary.
- Keep unexpected effort strings visually bounded.

---

### Task 1: Display and update effort metadata

**Files:**
- Modify: `tests/components/task-explorer.test.tsx`
- Modify: `src/components/task-run-browser.tsx`

**Interfaces:**
- Consumes: `NormalizedRun.raw: unknown`
- Produces: local `runEffort(run: NormalizedRun): string | null`

- [ ] **Step 1: Write the failing component test**

Add a test under `describe("TaskRunBrowser")` that renders two same-model runs:

```tsx
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
```

The production change caught by this test is removal of effort extraction, either badge, or active-selection propagation.

Add a second test with `raw: { effort: 42 }`:

```tsx
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
```

This test fails if malformed source metadata leaks into the interface or loses
the explicit unknown-value fallback.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test -- tests/components/task-explorer.test.tsx
```

Expected: FAIL because `Effort · xhigh` and `Effort · ultra` are not rendered.

- [ ] **Step 3: Add the defensive effort reader**

Add near `formattedDate`:

```ts
function runEffort(run: NormalizedRun): string | null {
  if (!run.raw || typeof run.raw !== "object" || Array.isArray(run.raw)) return null;
  const effort = (run.raw as { effort?: unknown }).effort;
  return typeof effort === "string" && effort.trim() ? effort.trim() : null;
}
```

Compute `activeEffort` once for the selected run.

- [ ] **Step 4: Render the badge and active metadata**

Inside each run button, replace the model-only title line with a bounded flex
row. Keep the model truncated and conditionally render:

```tsx
{effort && (
  <span className="max-w-28 shrink-0 truncate rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[0.65rem] font-semibold text-cyan-100">
    Effort · {effort}
  </span>
)}
```

Add an `Effort` definition to the active metadata list with
`activeEffort ?? "—"` and change the responsive grid to `sm:grid-cols-4`.

- [ ] **Step 5: Verify GREEN and missing-effort fallback**

Run:

```bash
pnpm test -- tests/components/task-explorer.test.tsx
```

Expected: PASS. The pre-existing unknown-metadata test must continue to confirm
that missing effort contributes an explicit `—`.

- [ ] **Step 6: Run the complete quality gate**

Run:

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build && git diff --check
```

Expected: 307 existing tests plus the two new tests pass, with zero lint,
TypeScript, build, or whitespace failures.

- [ ] **Step 7: Commit the implementation**

```bash
git add tests/components/task-explorer.test.tsx src/components/task-run-browser.tsx docs/superpowers/plans/2026-07-30-run-effort-badges.md
git commit -m "feat: show run effort badges"
```
