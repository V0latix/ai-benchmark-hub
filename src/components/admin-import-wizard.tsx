export function AdminImportWizard(_: { csrf: string }) {
  return (
    <section aria-labelledby="admin-import-title" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]" id="admin-import-title">
        Importer un benchmark
      </h1>
      <p className="mt-4 text-[var(--text-muted)]">Import bientôt disponible</p>
    </section>
  );
}
