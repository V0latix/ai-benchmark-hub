import type { NormalizedRun } from "../lib/sources/types";

const unknown = "—";

function text(value: string | null) {
  return value && value !== "unknown" ? value : unknown;
}

function date(value: string | null) {
  if (!value) return unknown;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? unknown
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(parsed);
}

function number(value: number | null) {
  return value === null ? unknown : new Intl.NumberFormat("fr-FR").format(value);
}

function cost(value: number | null) {
  return value === null
    ? unknown
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" }).format(value);
}

function duration(value: number | null) {
  return value === null ? unknown : `${new Intl.NumberFormat("fr-FR").format(value)} ms`;
}

type MetadataRow = {
  label: string;
  value: (run: NormalizedRun) => string;
};

const rows: MetadataRow[] = [
  { label: "Modèle", value: (run) => text(run.model) },
  { label: "Harness", value: (run) => text(run.harness) },
  { label: "Statut", value: (run) => text(run.status) },
  { label: "Date", value: (run) => date(run.createdAt) },
  { label: "Score", value: (run) => number(run.score) },
  { label: "Coût", value: (run) => cost(run.totalCostUsd) },
  { label: "Durée", value: (run) => duration(run.durationMs) },
  { label: "Tokens", value: (run) => number(run.totalTokens) }
];

export function RunMetadataGrid({ left, right }: { left: NormalizedRun; right: NormalizedRun }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className="bg-[var(--surface-raised)] text-[var(--text-primary)]">
          <tr>
            <th className="px-4 py-3" scope="col">Champ</th>
            <th className="px-4 py-3" scope="col">Modèle A</th>
            <th className="px-4 py-3" scope="col">Modèle B</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-t border-[var(--border)]" key={row.label}>
              <th className="px-4 py-3 font-medium text-[var(--text-muted)]" scope="row">{row.label}</th>
              <td className="px-4 py-3 text-[var(--text-primary)]">{row.value(left)}</td>
              <td className="px-4 py-3 text-[var(--text-primary)]">{row.value(right)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
