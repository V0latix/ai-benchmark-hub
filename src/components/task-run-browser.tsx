"use client";

import Link from "next/link";
import { useState } from "react";

import type { NormalizedRun } from "../lib/sources/types";
import { benchmarkSources } from "../lib/sources/config";
import { RunVisual } from "./run-visual";

function formattedDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function runMetadataLabel(run: NormalizedRun) {
  return [run.harness, formattedDate(run.createdAt) === "—" ? null : formattedDate(run.createdAt), `#${run.id.slice(-8)}`]
    .filter(Boolean)
    .join(" · ");
}

function branchFor(run: NormalizedRun) {
  return benchmarkSources.find((source) => source.id === run.sourceId)?.branch ?? "main";
}

export function TaskRunBrowser({
  initialRunId,
  prompt,
  runs,
  task,
  unresolvableRunIds = []
}: {
  initialRunId: string | null;
  prompt: string | null;
  runs: NormalizedRun[];
  task: string;
  unresolvableRunIds?: string[];
}) {
  const initialRun = runs.find((run) => run.id === initialRunId) ?? runs[0] ?? null;
  const [activeRunId, setActiveRunId] = useState(initialRun?.id ?? null);
  const activeRun = runs.find((run) => run.id === activeRunId) ?? initialRun;

  if (!activeRun) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center text-[var(--text-muted)]">
        Aucun run publié pour cette tâche.
      </div>
    );
  }

  const activeRunIsUnresolvable = unresolvableRunIds.includes(activeRun.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-6">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="font-semibold text-[var(--text-primary)]">Prompt canonique</h2>
          {prompt ? (
            <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--text-muted)]">{prompt}</pre>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Le prompt canonique n’est pas disponible actuellement.</p>
          )}
        </section>

        <section aria-labelledby="available-runs-title" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <h2 className="px-2 pb-2 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]" id="available-runs-title">
            Modèles et runs
          </h2>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col">
            {runs.map((run) => {
              const selected = run.id === activeRun.id;
              return (
                <li className="shrink-0 lg:w-full" key={`${run.task}:${run.id}`}>
                  <button
                    aria-label={`${run.model ?? "Modèle inconnu"}; ${runMetadataLabel(run)}; run ${run.id}`}
                    aria-pressed={selected}
                    className={`min-w-56 rounded-xl border px-3 py-3 text-left text-sm transition lg:w-full lg:min-w-0 ${
                      selected
                        ? "border-[var(--accent)] bg-cyan-400/10 text-[var(--text-primary)]"
                        : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-raised)]"
                    }`}
                    onClick={() => setActiveRunId(run.id)}
                    type="button"
                  >
                    <span className="block truncate font-medium">{run.model ?? "Modèle inconnu"}</span>
                    <span className="mt-1 block truncate text-xs opacity-80">{runMetadataLabel(run)}</span>
                    {unresolvableRunIds.includes(run.id) && (
                      <span className="mt-1 block text-xs text-amber-200">Aperçu et détail indisponibles</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <Link
          className="block rounded-xl bg-[var(--accent)] px-4 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-200"
          href={`/compare?task=${encodeURIComponent(task)}`}
        >
          Comparer deux modèles
        </Link>
      </aside>

      <section className="min-w-0">
        <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          Run actif : {activeRun.model ?? "modèle inconnu"}, {activeRun.id}
        </p>
        {activeRunIsUnresolvable ? (
          <section className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 px-6 text-center">
            <div>
              <p className="font-medium text-[var(--text-primary)]">Aperçu et détail indisponibles</p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--text-muted)]">
                Cet identifiant est partagé entre plusieurs tâches. Le run reste listé, mais aucun contenu ne sera ouvert sans résolution non ambiguë.
              </p>
            </div>
          </section>
        ) : (
          <RunVisual branch={branchFor(activeRun)} run={activeRun} />
        )}
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-end sm:justify-between">
          <dl className="grid min-w-0 flex-1 grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Modèle</dt>
              <dd className="mt-1 truncate font-medium text-[var(--text-primary)]">{activeRun.model ?? "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Harness</dt>
              <dd className="mt-1 truncate font-medium text-[var(--text-primary)]">{activeRun.harness ?? "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Publication</dt>
              <dd className="mt-1 truncate font-medium text-[var(--text-primary)]">{formattedDate(activeRun.createdAt)}</dd>
            </div>
          </dl>
          {activeRunIsUnresolvable ? (
            <span className="shrink-0 text-sm font-medium text-[var(--text-muted)]">Détail indisponible</span>
          ) : (
            <Link className="shrink-0 text-sm font-semibold text-[var(--accent)] hover:underline" href={`/runs/${encodeURIComponent(activeRun.id)}`}>
              Voir le détail du run →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
