"use client";

import { FormEvent, useId, useState } from "react";

const REFUSAL = "Accès refusé";

export function AdminLoginForm() {
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        body: JSON.stringify({ password }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      setPassword("");

      if (!response.ok) {
        setError(REFUSAL);
        return;
      }

      window.location.reload();
    } catch {
      setPassword("");
      setError(REFUSAL);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-6 max-w-md" onSubmit={submit}>
      <label className="mb-2 block text-sm font-medium text-[var(--text-muted)]" htmlFor={passwordId}>
        Mot de passe administrateur
      </label>
      <input
        autoComplete="current-password"
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)]"
        id={passwordId}
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
        value={password}
      />
      {error && <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p>}
      <button
        className="mt-5 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
