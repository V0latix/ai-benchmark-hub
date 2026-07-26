import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCountLabel } from "../../../components/task-card";
import { TaskRunBrowser } from "../../../components/task-run-browser";
import { SafeGitHubReader } from "../../../lib/github/client";
import { benchmarkSources } from "../../../lib/sources/config";
import { MELVYNX_SOURCE_ID } from "../../../lib/sources/types";
import { getTaskDetail } from "../../../lib/storage/queries";
import { getMelvynxTaskPrompt } from "../../../lib/tasks/catalog";

export const dynamic = "force-dynamic";

function decodedTask(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function taskLabel(task: string) {
  const words = task.replace(/[-_]+/g, " ");
  return words.charAt(0).toLocaleUpperCase("fr-FR") + words.slice(1);
}

export default async function TaskPage({ params }: { params: Promise<{ task: string }> }) {
  const task = decodedTask((await params).task);
  if (!task) notFound();

  const detail = await getTaskDetail(task);
  if (!detail) notFound();

  const cataloguedPrompt = getMelvynxTaskPrompt(task);
  const source = benchmarkSources.find((candidate) => candidate.id === MELVYNX_SOURCE_ID);
  let promptText: string | null = null;
  if (cataloguedPrompt && source) {
    try {
      promptText = await new SafeGitHubReader().readText(source, cataloguedPrompt.path);
    } catch {
      promptText = null;
    }
  }

  return (
    <section>
      <Link className="text-sm font-semibold text-[var(--accent)] hover:underline" href="/">← Retour à l’explorateur</Link>
      <header className="my-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--text-muted)]">Tâche benchmark</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">{taskLabel(task)}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {formatCountLabel(detail.runs.length, "run")} · {formatCountLabel(detail.models.length, "modèle")}
          </p>
        </div>
        {cataloguedPrompt && (
          <Link
            className="self-start rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] sm:self-auto"
            href={`https://benchmark.melvynx.dev/prompts/${cataloguedPrompt.slug}`}
          >
            Ouvrir le prompt canonique ↗
          </Link>
        )}
      </header>
      <TaskRunBrowser initialRunId={detail.representativeRunId} prompt={promptText} runs={detail.runs} task={detail.task} />
    </section>
  );
}
