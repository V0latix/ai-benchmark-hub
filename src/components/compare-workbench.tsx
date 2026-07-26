"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { benchmarkSources } from "../lib/sources/config";
import type { NormalizedRun } from "../lib/sources/types";
import type { ComparisonSelection } from "../lib/tasks/view-model";
import { RunMetadataGrid } from "./run-metadata-grid";
import { RunVisual } from "./run-visual";

function branchFor(run: NormalizedRun) {
  return benchmarkSources.find((source) => source.id === run.sourceId)?.branch ?? "main";
}

function runById(selection: ComparisonSelection, id: string | null) {
  if (!id) return null;
  return selection.models.flatMap(({ runs }) => runs).find((run) => run.id === id) ?? null;
}

function versionLabel(run: NormalizedRun) {
  if (!run.createdAt) return `— · ${run.id}`;
  const date = new Date(run.createdAt);
  const dateLabel = Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
  return `${dateLabel} · ${run.id}`;
}

function artifactUrl(run: NormalizedRun, path: string) {
  const branch = branchFor(run);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${run.sourceRepo}/blob/${encodeURIComponent(branch)}/${encodedPath}`;
}

function TaskSelector({
  selection,
  onChange
}: {
  selection: ComparisonSelection;
  onChange: (task: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-[var(--text-muted)]">
      <span>Tâche</span>
      <select
        className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]"
        onChange={(event) => onChange(event.target.value)}
        value={selection.task ?? ""}
      >
        {selection.tasks.map(({ task }) => <option key={task} value={task}>{task}</option>)}
      </select>
    </label>
  );
}

function AmbiguousRunState({ run }: { run: NormalizedRun }) {
  return (
    <section className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 px-6 text-center">
      <div>
        <p className="font-medium text-[var(--text-primary)]">Aperçu indisponible pour le run {run.id}</p>
        <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--text-muted)]">
          Cet identifiant est partagé entre plusieurs tâches. Le run reste sélectionnable, mais aucune route globale ne peut l’ouvrir sans ambiguïté.
        </p>
      </div>
    </section>
  );
}

function ComparisonVisual({
  ambiguous,
  run
}: {
  ambiguous: boolean;
  run: NormalizedRun;
}) {
  return ambiguous ? <AmbiguousRunState run={run} /> : <RunVisual branch={branchFor(run)} run={run} />;
}

function CodeLinks({ label, run }: { label: "A" | "B"; run: NormalizedRun }) {
  const artifacts = [
    { name: `Résultat ${label}`, path: run.resultPath },
    { name: `Aperçu ${label}`, path: run.previewPath }
  ].filter((artifact): artifact is { name: string; path: string } => Boolean(artifact.path));

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Modèle {label}</p>
      <h3 className="mt-2 font-semibold text-[var(--text-primary)]">{run.model ?? "—"}</h3>
      <p className="mt-1 break-all text-xs text-[var(--text-muted)]">Run {run.id}</p>
      {artifacts.length ? (
        <ul className="mt-5 space-y-2">
          {artifacts.map((artifact) => (
            <li key={artifact.name}>
              <Link
                className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                href={artifactUrl(run, artifact.path)}
              >
                {artifact.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-[var(--text-muted)]">Aucun artefact source disponible.</p>
      )}
    </section>
  );
}

export function CompareWorkbench({ selection }: { selection: ComparisonSelection }) {
  const router = useRouter();
  const selectionKey = `${selection.task ?? ""}\u0000${selection.leftId ?? ""}\u0000${selection.rightId ?? ""}`;
  const [pendingSelection, setPendingSelection] = useState({
    baseKey: selectionKey,
    leftId: selection.leftId,
    rightId: selection.rightId
  });
  const leftId = pendingSelection.baseKey === selectionKey ? pendingSelection.leftId : selection.leftId;
  const rightId = pendingSelection.baseKey === selectionKey ? pendingSelection.rightId : selection.rightId;
  const left = runById(selection, leftId);
  const right = runById(selection, rightId);
  const [focusedSide, setFocusedSide] = useState<"left" | "right">("left");
  const [tab, setTab] = useState<"preview" | "details" | "code">("preview");
  const [split, setSplit] = useState(false);

  function replaceSelection(task: string, nextLeftId?: string, nextRightId?: string) {
    const params = new URLSearchParams({ task });
    if (nextLeftId) params.set("left", nextLeftId);
    if (nextRightId) params.set("right", nextRightId);
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  }

  if (selection.reason === "no-tasks") {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Aucune tâche publiée</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">La comparaison sera disponible dès que des runs seront publiés.</p>
      </section>
    );
  }

  if (selection.reason === "not-enough-models" || !left || !right) {
    return (
      <div className="space-y-5">
        <div className="max-w-sm">
          <TaskSelector selection={selection} onChange={(task) => replaceSelection(task)} />
        </div>
        <section className="rounded-2xl border border-dashed border-amber-400/40 bg-amber-400/5 px-6 py-12 text-center">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Comparaison indisponible</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
            Cette tâche doit proposer au moins deux modèles distincts avant de pouvoir comparer leurs runs.
          </p>
        </section>
      </div>
    );
  }

  const activeRun = focusedSide === "left" ? left : right;
  const leftModel = selection.models.find(({ model }) => model === left.model);
  const rightModel = selection.models.find(({ model }) => model === right.model);
  const leftIsAmbiguous = selection.ambiguousRunIds.includes(left.id);
  const rightIsAmbiguous = selection.ambiguousRunIds.includes(right.id);
  const currentLeftId = left.id;
  const currentRightId = right.id;

  function changeModel(side: "left" | "right", model: string) {
    const nextRun = selection.models.find((candidate) => candidate.model === model)?.runs[0];
    if (!nextRun || !selection.task) return;
    if (side === "left") {
      setPendingSelection({ baseKey: selectionKey, leftId: nextRun.id, rightId: currentRightId });
      replaceSelection(selection.task, nextRun.id, currentRightId);
    } else {
      setPendingSelection({ baseKey: selectionKey, leftId: currentLeftId, rightId: nextRun.id });
      replaceSelection(selection.task, currentLeftId, nextRun.id);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <TaskSelector selection={selection} onChange={(task) => replaceSelection(task)} />
          <label className="grid gap-2 text-sm font-medium text-[var(--text-muted)]">
            <span>Modèle A</span>
            <select
              className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]"
              onChange={(event) => changeModel("left", event.target.value)}
              value={left.model ?? ""}
            >
            {selection.models
              .filter(({ model }) => model !== right.model)
              .map(({ model }) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-[var(--text-muted)]">
            <span>Modèle B</span>
            <select
              className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]"
              onChange={(event) => changeModel("right", event.target.value)}
              value={right.model ?? ""}
            >
            {selection.models
              .filter(({ model }) => model !== left.model)
              .map(({ model }) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          {leftModel && leftModel.runs.length > 1 && (
            <label className="grid gap-2 text-sm font-medium text-[var(--text-muted)]">
              <span>Version du run A</span>
              <select
                className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]"
                onChange={(event) => {
                  setPendingSelection({ baseKey: selectionKey, leftId: event.target.value, rightId: right.id });
                  if (selection.task) replaceSelection(selection.task, event.target.value, right.id);
                }}
                value={left.id}
              >
                {leftModel.runs.map((run) => <option key={`${run.task}:${run.id}`} value={run.id}>{versionLabel(run)}</option>)}
              </select>
            </label>
          )}
          {rightModel && rightModel.runs.length > 1 && (
            <label className="grid gap-2 text-sm font-medium text-[var(--text-muted)]">
              <span>Version du run B</span>
              <select
                className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[var(--text-primary)]"
                onChange={(event) => {
                  setPendingSelection({ baseKey: selectionKey, leftId: left.id, rightId: event.target.value });
                  if (selection.task) replaceSelection(selection.task, left.id, event.target.value);
                }}
                value={right.id}
              >
                {rightModel.runs.map((run) => <option key={`${run.task}:${run.id}`} value={run.id}>{versionLabel(run)}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)]">
        <div aria-label="Vues de comparaison" className="flex gap-1" role="tablist">
          {([
            ["preview", "Aperçu"],
            ["details", "Détails"],
            ["code", "Code"]
          ] as const).map(([value, label]) => (
            <button
              aria-controls={`compare-panel-${value}`}
              aria-selected={tab === value}
              className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${
                tab === value
                  ? "border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              id={`compare-tab-${value}`}
              key={value}
              onClick={() => setTab(value)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "preview" && (
          <button
            aria-pressed={split}
            className="hidden min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent)] lg:inline-flex"
            onClick={() => setSplit((current) => !current)}
            type="button"
          >
            Vue scindée
          </button>
        )}
      </div>

      {tab === "preview" && (
        <section aria-labelledby="compare-tab-preview" id="compare-panel-preview" role="tabpanel">
          <div aria-label="Run affiché" className="mb-4 grid grid-cols-2 gap-2" role="group">
            {([
              ["left", "A", left],
              ["right", "B", right]
            ] as const).map(([side, label, run]) => (
              <button
                aria-pressed={focusedSide === side}
                className={`min-w-0 rounded-xl border px-4 py-3 text-left transition ${
                  focusedSide === side
                    ? "border-[var(--accent)] bg-cyan-400/10"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
                key={side}
                onClick={() => setFocusedSide(side)}
                type="button"
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">Modèle {label}</span>
                <span className="mt-1 block truncate font-semibold text-[var(--text-primary)]">{run.model ?? "—"}</span>
                <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">Run {run.id}</span>
              </button>
            ))}
          </div>

          {split ? (
            <>
              <div aria-label="Vue alternée mobile" className="lg:hidden" role="region">
                <ComparisonVisual
                  ambiguous={focusedSide === "left" ? leftIsAmbiguous : rightIsAmbiguous}
                  run={activeRun}
                />
              </div>
              <div aria-label="Vue scindée des runs" className="hidden gap-4 lg:grid lg:grid-cols-2" role="region">
                <ComparisonVisual ambiguous={leftIsAmbiguous} run={left} />
                <ComparisonVisual ambiguous={rightIsAmbiguous} run={right} />
              </div>
            </>
          ) : (
            <div aria-label="Vue alternée des runs" role="region">
              <ComparisonVisual
                ambiguous={focusedSide === "left" ? leftIsAmbiguous : rightIsAmbiguous}
                run={activeRun}
              />
            </div>
          )}
        </section>
      )}

      {tab === "details" && (
        <section aria-labelledby="compare-tab-details" id="compare-panel-details" role="tabpanel">
          <RunMetadataGrid left={left} right={right} />
        </section>
      )}

      {tab === "code" && (
        <section
          aria-labelledby="compare-tab-code"
          className="grid gap-4 md:grid-cols-2"
          id="compare-panel-code"
          role="tabpanel"
        >
          <CodeLinks label="A" run={left} />
          <CodeLinks label="B" run={right} />
        </section>
      )}
    </div>
  );
}
