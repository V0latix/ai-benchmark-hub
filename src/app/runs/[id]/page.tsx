import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonViewer } from "../../../components/json-viewer";
import { RunVisual } from "../../../components/run-visual";
import { benchmarkSources } from "../../../lib/sources/config";
import { SafeGitHubReader } from "../../../lib/github/client";
import { displayRunStatus } from "../../../lib/runs/status-display";
import { getRunById } from "../../../lib/storage/queries";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = await getRunById((await params).id);
  if (!run) notFound();

  const source = benchmarkSources.find((item) => item.id === run.sourceId);
  const branch = source?.branch ?? "main";
  const links = [["Prompt", run.promptPath], ["Transcription", run.transcriptPath], ["Résultat", run.resultPath], ["Preuve", run.evidencePath], ["Capture", run.screenshotPath], ["Aperçu", run.previewPath]].filter(([, path]) => path);
  let transcript: string | null = null;
  if (source && run.transcriptPath) {
    try {
      transcript = await new SafeGitHubReader().readText(source, run.transcriptPath);
    } catch {
      transcript = null;
    }
  }

  const metadata = {
    Tâche: run.task,
    Modèle: run.model,
    Harness: run.harness,
    Statut: displayRunStatus(run.status),
    Score: run.score,
    "Coût (USD)": run.totalCostUsd,
    Tokens: run.totalTokens,
    "Durée (ms)": run.durationMs,
    Publication: run.createdAt,
    Fournisseur: run.provider
  };

  return (
    <section>
      <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
        <Link className="text-[var(--accent)] hover:underline" href="/">Explorateur</Link>
        <span aria-hidden="true">/</span>
        <Link className="text-[var(--accent)] hover:underline" href="/runs">Tous les runs</Link>
        <span aria-hidden="true">/</span>
        <span>{run.task ?? "Run"}</span>
      </nav>
      <header className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-7 sm:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Run Melvynx</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">{run.task ?? "Résultat sans titre"}</h1>
          <p className="mt-2 text-[var(--text-muted)]">{run.model ?? "—"} · {run.harness ?? "—"}</p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1 text-sm text-[var(--text-primary)]">{displayRunStatus(run.status)}</span>
      </header>
      <div className="mt-6"><RunVisual branch={branch} run={run} /></div>
      <div className="my-6 flex flex-wrap gap-3">
        {links.map(([label, path]) => <Link className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--accent)] hover:border-[var(--accent)]" key={label} href={`https://github.com/${run.sourceRepo}/blob/${branch}/${path}`}>{label} ↗</Link>)}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(metadata).map(([label, value]) => (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
            <dd className="mt-2 break-words text-[var(--text-primary)]">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {transcript && <details className="my-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><summary className="cursor-pointer font-medium text-[var(--text-primary)]">Transcription</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-[var(--text-muted)]">{transcript}</pre></details>}
      <div className="mt-6"><JsonViewer value={run.raw} /></div>
    </section>
  );
}
