"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NormalizedRun } from "../lib/sources/types";

type SortKey = "cost" | "score" | "date" | "duration" | "model" | "task";
type Filters = { search: string; model: string; task: string; harness: string; status: string; sort: SortKey; direction?: "asc" | "desc" };

function dash(value: string | number | null): string | number {
  return value ?? "—";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

export function filterRuns(runs: NormalizedRun[], filters: Filters) {
  const search = filters.search.toLowerCase().trim();
  const direction = filters.direction ?? "desc";
  const key = filters.sort === "cost" ? "totalCostUsd" : filters.sort === "score" ? "score" : filters.sort === "duration" ? "durationMs" : filters.sort === "date" ? "createdAt" : filters.sort;

  return runs
    .filter((run) => (!filters.model || run.model === filters.model)
      && (!filters.task || run.task === filters.task)
      && (!filters.harness || run.harness === filters.harness)
      && (!filters.status || run.status === filters.status)
      && (!search || [run.model, run.provider, run.harness, run.task].some((value) => value?.toLowerCase().includes(search))))
    .sort((left, right) => {
      const a = left[key] ?? (direction === "asc" ? Infinity : -Infinity);
      const b = right[key] ?? (direction === "asc" ? Infinity : -Infinity);
      const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
      return direction === "asc" ? result : -result;
    });
}

export function RunTable({ runs }: { runs: NormalizedRun[] }) {
  const [filters, setFilters] = useState<Filters>({ search: "", model: "", task: "", harness: "", status: "", sort: "date", direction: "desc" });
  const visible = useMemo(() => filterRuns(runs, filters), [runs, filters]);
  const ambiguousRunIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of runs) counts.set(run.id, (counts.get(run.id) ?? 0) + 1);
    return new Set([...counts].flatMap(([id, count]) => count > 1 ? [id] : []));
  }, [runs]);
  const options = (field: "model" | "task" | "harness") => [...new Set(runs.flatMap((run) => run[field] ? [run[field] as string] : []))].sort();
  const select = (label: string, field: keyof Pick<Filters, "model" | "task" | "harness" | "status">, values: string[]) => (
    <label className="grid gap-1 text-xs font-medium text-[var(--text-muted)]">
      {label}
      <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]" value={filters[field]} onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}>
        <option value="">Tous</option>
        {values.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
        <div className="mb-4">
          <h2 className="font-semibold text-[var(--text-primary)]">Filtres</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{visible.length} sur {runs.length} runs</p>
        </div>
        <div className="grid gap-4">
          <label className="grid gap-1 text-xs font-medium text-[var(--text-muted)]">
            Rechercher
            <input className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Modèle, tâche…" />
          </label>
          {select("Tâche", "task", options("task"))}
          {select("Modèle", "model", options("model"))}
          {select("Harness", "harness", options("harness"))}
          {select("Statut", "status", ["success", "failed", "partial", "timeout", "unknown"])}
          <label className="grid gap-1 text-xs font-medium text-[var(--text-muted)]">
            Trier par
            <select className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as SortKey })}>
              <option value="date">Date</option>
              <option value="model">Modèle</option>
              <option value="task">Tâche</option>
              <option value="score">Score</option>
              <option value="cost">Coût</option>
              <option value="duration">Durée</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className={`rounded-lg border px-2 py-2 text-xs ${filters.direction === "desc" ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`} onClick={() => setFilters({ ...filters, direction: "desc" })}>Décroissant</button>
            <button className={`rounded-lg border px-2 py-2 text-xs ${filters.direction === "asc" ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`} onClick={() => setFilters({ ...filters, direction: "asc" })}>Croissant</button>
          </div>
          <button className="text-left text-xs text-[var(--accent)]" onClick={() => setFilters({ search: "", model: "", task: "", harness: "", status: "", sort: "date", direction: "desc" })}>Réinitialiser les filtres</button>
        </div>
      </aside>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-raised)] text-[var(--text-muted)]">
            <tr>{["Tâche", "Modèle", "Harness", "Aperçu", "Statut", "Date", "Détail"].map((label) => <th className="p-3 font-medium" key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((run, index) => (
              <tr className="border-t border-[var(--border)] hover:bg-[var(--surface-raised)]" key={`${run.id}-${run.task ?? "unknown"}-${index}`}>
                <td className="p-3">{dash(run.task)}</td>
                <td className="p-3">{dash(run.model)}</td>
                <td className="p-3">{dash(run.harness)}</td>
                <td className="p-3">{run.previewPath || run.screenshotPath ? "Disponible" : "—"}</td>
                <td className="p-3">{dash(run.status)}</td>
                <td className="p-3">{formatDate(run.createdAt)}</td>
                <td className="p-3">{ambiguousRunIds.has(run.id) ? <span className="text-xs text-[var(--text-muted)]">ID ambigu</span> : <Link className="font-medium text-[var(--accent)]" href={`/runs/${encodeURIComponent(run.id)}`}>Voir le run</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
