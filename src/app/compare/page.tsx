import { CompareWorkbench } from "../../components/compare-workbench";
import { getComparisonSelection } from "../../lib/storage/queries";
import {
  comparisonSearchSignature,
  type RawComparisonSearchParams
} from "../../lib/tasks/comparison-url";

export const dynamic = "force-dynamic";

type CompareSearchParams = Promise<RawComparisonSearchParams>;

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function ComparePage({ searchParams }: { searchParams: CompareSearchParams }) {
  const params = await searchParams;
  const selection = await getComparisonSelection({
    task: singleValue(params.task),
    leftId: singleValue(params.left),
    rightId: singleValue(params.right)
  });

  return (
    <section>
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Comparaison task-scoped</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Comparez deux runs, sur la même tâche.
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--text-muted)]">
          Alternez entre deux résultats en plein format, puis alignez leurs détails et leurs artefacts source.
        </p>
      </header>
      <CompareWorkbench
        originQuerySignature={comparisonSearchSignature(params)}
        selection={selection}
      />
    </section>
  );
}
