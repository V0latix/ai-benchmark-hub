"use client";

import { useId, useMemo, useState } from "react";

import type { TaskCardView } from "../lib/tasks/view-model";
import { TaskCard } from "./task-card";

export function TaskExplorer({ cards }: { cards: TaskCardView[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
  const filteredCards = useMemo(
    () => cards.filter((card) => (
      !normalizedQuery
      || card.task.toLocaleLowerCase("fr-FR").includes(normalizedQuery)
      || card.models.some((model) => model.toLocaleLowerCase("fr-FR").includes(normalizedQuery))
    )),
    [cards, normalizedQuery]
  );

  return (
    <section aria-labelledby="task-library-title" className="mt-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Bibliothèque publique</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]" id="task-library-title">
            Choisissez une tâche
          </h2>
        </div>
        <div className="w-full sm:max-w-md">
          <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]" htmlFor={searchId}>
            Rechercher une tâche ou un modèle
          </label>
          <input
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] placeholder:text-slate-500"
            id={searchId}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. Gmail, Claude, GPT…"
            type="search"
            value={query}
          />
        </div>
      </div>

      {filteredCards.length ? (
        <div aria-live="polite" className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCards.map((card) => <TaskCard card={card} key={card.task} />)}
        </div>
      ) : (
        <div aria-live="polite" className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center">
          <p className="font-medium text-[var(--text-primary)]">
            {cards.length ? "Aucune tâche ne correspond à votre recherche." : "Aucune tâche publiée pour le moment."}
          </p>
          {cards.length > 0 && <p className="mt-2 text-sm text-[var(--text-muted)]">Essayez un autre nom de tâche ou de modèle.</p>}
        </div>
      )}
    </section>
  );
}
