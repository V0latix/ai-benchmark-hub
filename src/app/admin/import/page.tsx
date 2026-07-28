import { cookies } from "next/headers";

import { AdminImportWizard } from "../../../components/admin-import-wizard";
import { AdminLoginForm } from "../../../components/admin-login-form";
import { verifyAdminSession } from "../../../lib/admin/auth";
import { readAdminEnvironment } from "../../../lib/admin/env";
import { getTaskCards } from "../../../lib/storage/queries";

export const dynamic = "force-dynamic";

function LoginView() {
  return (
    <section aria-labelledby="admin-import-title" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Administration</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]" id="admin-import-title">
        Importer un benchmark
      </h1>
      <p className="mt-4 max-w-2xl text-[var(--text-muted)]">
        Connectez-vous pour importer un run LM Arena dans le dépôt de benchmarks.
      </p>
      <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">
        Les fichiers et métadonnées seront contrôlés avant toute prévisualisation ou publication.
      </p>
      <AdminLoginForm />
    </section>
  );
}

export default async function AdminImportPage() {
  let csrf: string | null = null;

  try {
    const env = readAdminEnvironment();
    const cookieStore = await cookies();
    const token = cookieStore.get("benchmark_admin")?.value;
    const session = token ? verifyAdminSession(token, env.sessionSecret) : null;
    csrf = session?.csrf ?? null;
  } catch {
    // Hide server configuration and authentication details from this page.
  }

  if (csrf) {
    const tasks = (await getTaskCards()).map((card) => card.task);
    return <AdminImportWizard csrf={csrf} tasks={tasks} />;
  }
  return <LoginView />;
}
