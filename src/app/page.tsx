import { TaskExplorer } from "../components/task-explorer";
import { getCache, getTaskCards } from "../lib/storage/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [cards, cache] = await Promise.all([getTaskCards(), getCache()]);
  const runCount = cards.reduce((total, card) => total + card.runCount, 0);

  return (
    <>
      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface),#13233b)] px-6 py-10 sm:px-10 sm:py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Melvynx Benchmarks</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] sm:text-5xl">
          Explorez ce que les modèles savent vraiment construire.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
          Parcourez chaque tâche, ouvrez ses résultats interactifs et choisissez les runs à comparer.
        </p>
        <dl className="mt-8 flex flex-wrap gap-8">
          <div>
            <dt className="text-sm text-[var(--text-muted)]">Tâches publiées</dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{cards.length}</dd>
          </div>
          <div>
            <dt className="text-sm text-[var(--text-muted)]">Runs disponibles</dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{runCount}</dd>
          </div>
        </dl>
      </section>

      {cache.freshnessWarnings.length > 0 && (
        <aside className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100" role="status">
          <p className="font-medium">Les données en direct n’ont pas toutes pu être actualisées.</p>
          <ul className="mt-1 list-inside list-disc text-amber-100/80">
            {cache.freshnessWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </aside>
      )}

      <TaskExplorer cards={cards} />
    </>
  );
}
