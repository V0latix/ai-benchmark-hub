# Run Effort Badges — Design

## Goal

Make repeated runs of the same model immediately distinguishable by displaying
the reasoning effort already present in the Melvynx metadata.

## Considered approaches

1. **Read `raw.effort` at the UI boundary (selected).** Add one small,
   defensive helper that accepts a normalized run and returns a non-empty effort
   string or `null`. This keeps the bundled Melvynx snapshot byte-for-byte
   unchanged and limits the change to presentation.
2. **Add `effort` to every normalized run.** This provides a stronger domain
   type, but requires changing adapters, imported-run validation, fixtures, and
   snapshots for a value currently used only by the UI.
3. **Derive a label from the run ID.** This distinguishes timestamps but cannot
   recover effort and would not answer the requested need.

Approach 1 is the smallest reliable change. A later metadata redesign can
promote effort to a first-class normalized field if it gains more consumers.

## Interface

- Each item in “Modèles et runs” displays a compact `Effort · <value>` pill next
  to the model name when `raw.effort` is a non-empty string.
- The active-run metadata summary also displays the effort as a fourth field.
- Missing, blank, malformed, or absent effort remains unrendered in the run
  list and displays `—` in the active summary.
- Existing model, harness, date, run-selection, preview, and ambiguity behavior
  remains unchanged.
- Long or unexpected effort values use the same bounded visual treatment as
  other metadata and cannot alter layout structure.

## Data flow

`TaskRunBrowser` receives the existing `NormalizedRun`, extracts the optional
effort from its untrusted `raw` object through a type-safe helper, and reuses the
result in the run card and active summary. No source data is rewritten.

## Verification

A component test renders two `gpt-5.6-sol` runs with literal `xhigh` and `ultra`
metadata and asserts that both badges are visible and that selecting the second
run updates the active effort summary. A second assertion covers a run without
valid effort so the UI keeps its explicit fallback.

