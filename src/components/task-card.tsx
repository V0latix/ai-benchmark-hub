import Link from "next/link";

import type { TaskCardView } from "../lib/tasks/view-model";
import { RunPreviewFrame } from "./run-visual";

function taskLabel(task: string) {
  const words = task.replace(/[-_]+/g, " ");
  return words.charAt(0).toLocaleUpperCase("fr-FR") + words.slice(1);
}

export function formatCountLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function TaskCard({ card }: { card: TaskCardView }) {
  const label = taskLabel(card.task);
  const runCount = formatCountLabel(card.runCount, "run");
  const modelCount = formatCountLabel(card.modelCount, "modèle");
  const accessibleLabel = `Ouvrir ${label}, ${runCount} et ${modelCount}`;

  return (
    <article className="group relative grid min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-xl hover:shadow-cyan-950/20">
      <div className="relative aspect-[16/10] overflow-hidden border-b border-[var(--border)] bg-slate-950">
        {card.representativeRunId ? (
          <RunPreviewFrame
            className="h-full w-full bg-white transition duration-300 group-hover:scale-[1.01]"
            interactive={false}
            runId={card.representativeRunId}
            title={`Aperçu de ${label}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
            Aucun aperçu disponible
          </div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
      </div>
      <div className="flex items-end justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)]">{label}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {runCount} · {modelCount}
          </p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-xl text-[var(--accent)] transition-transform group-hover:translate-x-1">→</span>
      </div>
      <Link
        aria-label={accessibleLabel}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-[-3px]"
        href={`/tasks/${encodeURIComponent(card.task)}`}
      >
        <span className="sr-only">{accessibleLabel}</span>
      </Link>
    </article>
  );
}
