import { RunTable } from "../../components/run-table";
import { queryRuns } from "../../lib/storage/queries";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await queryRuns();

  return (
    <section>
      <header className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-8 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Inventaire</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">Tous les runs</h1>
        <p className="mt-3 max-w-2xl leading-7 text-[var(--text-muted)]">Filtrez les résultats Melvynx par tâche, modèle, harness ou statut.</p>
      </header>
      <div className="mt-6"><RunTable runs={runs} /></div>
    </section>
  );
}
