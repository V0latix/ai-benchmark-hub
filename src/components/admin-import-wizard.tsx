"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  UploadCloud,
  X
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { inspectArchive } from "../lib/imports/archive";
import type { ArchiveInspection, ValidatedImportFile } from "../lib/imports/types";
import { ImportDropzone } from "./import-dropzone";
import { ImportPreview } from "./import-preview";

type WizardPhase =
  | "identify"
  | "validated"
  | "uploading"
  | "preview"
  | "publishing"
  | "success"
  | "expired";

type DraftMetadata = {
  task: string;
  model: string;
  harness: "lmarena";
  createdAt: string;
  notes: string;
};

type UploadSession = {
  draftId: string;
  uploadToken: string;
  receipts: Record<string, string>;
  failedPaths: string[];
  metadata: DraftMetadata;
};

type FinalizedDraft = {
  draftId: string;
  draftToken: string;
  previewUrl: string;
  metadata: DraftMetadata;
};

type PublishedResult = {
  runUrl: string;
  taskUrl: string;
  cleanupWarning: string | null;
  invalidationWarning: string | null;
};

type ErrorPayload = { error?: string };

const steps = [
  { number: 1, label: "Identifier le run" },
  { number: 2, label: "Valider l’archive" },
  { number: 3, label: "Prévisualiser" },
  { number: 4, label: "Publier" }
] as const;

class SessionExpiredError extends Error {}

function currentStep(phase: WizardPhase) {
  if (phase === "identify") return 1;
  if (phase === "validated" || phase === "uploading") return 2;
  if (phase === "preview") return 3;
  return 4;
}

function bytesLabel(bytes: number) {
  if (bytes < 1_000) return `${bytes} o`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Ko`;
  return `${(bytes / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture de l’archive impossible"));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Lecture de l’archive impossible"));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function safeError(payload: ErrorPayload, fallback: string) {
  return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
}

export function AdminImportWizard({ csrf, tasks }: { csrf: string; tasks: string[] }) {
  const generationId = useId();
  const modelId = useId();
  const notesId = useId();
  const taskId = useId();
  const inspectionSequence = useRef(0);
  const operationSequence = useRef(0);

  const canonicalTasks = [...new Set(tasks)].sort((left, right) => left.localeCompare(right, "fr"));
  const [phase, setPhase] = useState<WizardPhase>("identify");
  const [task, setTask] = useState("");
  const [model, setModel] = useState("");
  const [generationTime, setGenerationTime] = useState("");
  const [notes, setNotes] = useState("");
  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ArchiveInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState({ complete: 0, total: 0 });
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [draft, setDraft] = useState<FinalizedDraft | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [publishFailed, setPublishFailed] = useState(false);
  const [published, setPublished] = useState<PublishedResult | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeStep = currentStep(phase);
  function clearArchiveData() {
    inspectionSequence.current += 1;
    operationSequence.current += 1;
    setArchiveName(null);
    setInspection(null);
    setUploadSession(null);
    setDraft(null);
    setProgress({ complete: 0, total: 0 });
    setPreviewLoaded(false);
    setPreviewFailed(false);
    setPublishFailed(false);
  }

  function resetAll(options: { preserveNotice?: boolean } = {}) {
    clearArchiveData();
    setTask("");
    setModel("");
    setGenerationTime("");
    setNotes("");
    setPublished(null);
    setError(null);
    if (!options.preserveNotice) setNotice(null);
    setPhase("identify");
  }

  function expireSession() {
    clearArchiveData();
    setPublished(null);
    setError("Votre session a expiré. Reconnectez-vous pour reprendre un nouvel import.");
    setPhase("expired");
  }

  async function chooseArchive(file: File) {
    operationSequence.current += 1;
    const sequence = inspectionSequence.current + 1;
    inspectionSequence.current = sequence;
    setArchiveName(file.name);
    setInspection(null);
    setUploadSession(null);
    setDraft(null);
    setPublished(null);
    setPreviewLoaded(false);
    setPreviewFailed(false);
    setPublishFailed(false);
    setNotice(null);
    setError(null);
    setPhase("identify");
    setInspecting(true);

    try {
      if (!file.name.toLocaleLowerCase("fr-FR").endsWith(".zip")) {
        throw new Error("Sélectionnez une archive ZIP LM Arena.");
      }
      const result = await inspectArchive(await readFileBytes(file));
      if (inspectionSequence.current !== sequence) return;
      setInspection(result);
      setPhase("validated");
    } catch (archiveError) {
      if (inspectionSequence.current !== sequence) return;
      setArchiveName(null);
      setError(archiveError instanceof Error ? archiveError.message : "Archive ZIP invalide.");
    } finally {
      if (inspectionSequence.current === sequence) setInspecting(false);
    }
  }

  function resolvedMetadata(): DraftMetadata | null {
    const trimmedModel = model.normalize("NFC").trim();
    if (!canonicalTasks.includes(task)) {
      setError("Choisissez une task existante.");
      return null;
    }
    if (!trimmedModel) {
      setError("Renseignez le modèle utilisé.");
      return null;
    }

    let createdAt: string;
    try {
      createdAt = generationTime ? new Date(generationTime).toISOString() : new Date().toISOString();
    } catch {
      setError("La date de génération est invalide.");
      return null;
    }
    if (createdAt === "Invalid Date") {
      setError("La date de génération est invalide.");
      return null;
    }

    return {
      task,
      model: trimmedModel,
      harness: "lmarena",
      createdAt,
      notes: notes.normalize("NFC").trim()
    };
  }

  async function beginPreview() {
    if (!inspection) return;
    const metadata = resolvedMetadata();
    if (!metadata) return;
    setError(null);
    setNotice(null);
    setPhase("uploading");
    setProgress({ complete: 0, total: inspection.files.length });
    const operation = operationSequence.current + 1;
    operationSequence.current = operation;

    try {
      const response = await fetch("/api/admin/imports", {
        method: "POST",
        headers: { "x-csrf-token": csrf }
      });
      if (operationSequence.current !== operation) return;
      if (response.status === 401) throw new SessionExpiredError();
      const payload = await readJson<{ draftId?: string; uploadToken?: string } & ErrorPayload>(response);
      if (!response.ok || !payload.draftId || !payload.uploadToken) {
        throw new Error(safeError(payload, "Création du brouillon impossible."));
      }
      const session: UploadSession = {
        draftId: payload.draftId,
        uploadToken: payload.uploadToken,
        receipts: {},
        failedPaths: [],
        metadata
      };
      setUploadSession(session);
      await uploadAndFinalize(session, inspection.files, operation);
    } catch (uploadError) {
      if (operationSequence.current !== operation) return;
      if (uploadError instanceof SessionExpiredError) {
        expireSession();
        return;
      }
      setPhase("validated");
      setError(uploadError instanceof Error ? uploadError.message : "Import impossible.");
    }
  }

  async function uploadAndFinalize(
    session: UploadSession,
    files: ValidatedImportFile[],
    operation: number
  ) {
    const receipts = { ...session.receipts };
    const failedPaths: string[] = [];
    let nextIndex = 0;
    let completed = Object.keys(receipts).length;
    let fatal: Error | null = null;
    setError(null);
    setPhase("uploading");
    setProgress({ complete: completed, total: inspection?.files.length ?? files.length });

    async function worker() {
      while (!fatal && operationSequence.current === operation) {
        const index = nextIndex;
        nextIndex += 1;
        const file = files[index];
        if (!file) return;

        try {
          const response = await fetch("/api/admin/imports/files", {
            method: "POST",
            headers: {
              "content-type": file.contentType,
              "x-csrf-token": csrf,
              "x-import-content-type": encodeURIComponent(file.contentType),
              "x-import-path": encodeURIComponent(file.path),
              "x-import-upload-token": session.uploadToken
            },
            body: Uint8Array.from(file.bytes)
          });
          if (operationSequence.current !== operation) return;
          if (response.status === 401) throw new SessionExpiredError();
          const payload = await readJson<{ receipt?: string } & ErrorPayload>(response);
          if (!response.ok || !payload.receipt) {
            failedPaths.push(file.path);
          } else {
            receipts[file.path] = payload.receipt;
          }
        } catch (uploadError) {
          if (uploadError instanceof SessionExpiredError) {
            fatal = uploadError;
          } else {
            failedPaths.push(file.path);
          }
        } finally {
          if (operationSequence.current !== operation) return;
          completed += 1;
          setProgress((current) => ({ ...current, complete: completed }));
        }
      }
    }

    await Promise.all(Array.from(
      { length: Math.min(3, files.length) },
      () => worker()
    ));
    if (operationSequence.current !== operation) return;
    if (fatal) throw fatal;

    const updatedSession = { ...session, receipts, failedPaths };
    setUploadSession(updatedSession);
    if (failedPaths.length) {
      setPhase("validated");
      setError(
        failedPaths.length === 1
          ? "1 fichier n’a pas été accepté. Le reçu déjà obtenu est conservé."
          : `${failedPaths.length} fichiers n’ont pas été acceptés. Les reçus déjà obtenus sont conservés.`
      );
      return;
    }
    await finalize(updatedSession, operation);
  }

  async function retryFailedUploads() {
    if (!uploadSession || !inspection || !uploadSession.failedPaths.length) return;
    const failed = new Set(uploadSession.failedPaths);
    const files = inspection.files.filter((file) => failed.has(file.path));
    const operation = operationSequence.current + 1;
    operationSequence.current = operation;
    try {
      await uploadAndFinalize({ ...uploadSession, failedPaths: [] }, files, operation);
    } catch (uploadError) {
      if (operationSequence.current !== operation) return;
      if (uploadError instanceof SessionExpiredError) {
        expireSession();
        return;
      }
      setPhase("validated");
      setError("Le nouvel envoi a échoué. Les reçus valides restent conservés.");
    }
  }

  async function finalize(session: UploadSession, operation: number) {
    if (!inspection) return;
    const body = JSON.stringify({
      draftId: session.draftId,
      metadata: session.metadata,
      receipts: inspection.files.map((file) => session.receipts[file.path])
    });
    const response = await fetch("/api/admin/imports/finalize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf
      },
      body
    });
    if (operationSequence.current !== operation) return;
    if (response.status === 401) throw new SessionExpiredError();
    const payload = await readJson<{ draftToken?: string; previewUrl?: string } & ErrorPayload>(response);
    if (!response.ok || !payload.draftToken || !payload.previewUrl) {
      throw new Error(safeError(payload, "Finalisation du brouillon impossible."));
    }

    setDraft({
      draftId: session.draftId,
      draftToken: payload.draftToken,
      previewUrl: payload.previewUrl,
      metadata: session.metadata
    });
    setPreviewLoaded(false);
    setPreviewFailed(false);
    setPhase("preview");
  }

  async function publishDraft() {
    if (!draft || !previewLoaded) return;
    setError(null);
    setPublishFailed(false);
    setPhase("publishing");
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(draft.draftId)}/publish`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({ draftToken: draft.draftToken })
      });
      if (response.status === 401) throw new SessionExpiredError();
      const payload = await readJson<PublishedResult & ErrorPayload>(response);
      if (!response.ok || !payload.runUrl || !payload.taskUrl) {
        throw new Error(safeError(payload, "Publication impossible; le brouillon reste disponible."));
      }

      clearArchiveData();
      setPublished({
        runUrl: payload.runUrl,
        taskUrl: payload.taskUrl,
        cleanupWarning: payload.cleanupWarning ?? null,
        invalidationWarning: payload.invalidationWarning ?? null
      });
      setPhase("success");
    } catch (publishError) {
      if (publishError instanceof SessionExpiredError) {
        expireSession();
        return;
      }
      setPhase("preview");
      setPublishFailed(true);
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Publication impossible; le brouillon reste disponible."
      );
    }
  }

  async function cancelDraft() {
    if (!draft) return;
    setError(null);
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(draft.draftId)}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf
        },
        body: JSON.stringify({ draftToken: draft.draftToken })
      });
      if (response.status === 401) throw new SessionExpiredError();
      const payload = await readJson<ErrorPayload>(response);
      if (!response.ok) throw new Error(safeError(payload, "Annulation impossible."));
      resetAll({ preserveNotice: true });
      setNotice("Brouillon annulé.");
    } catch (cancelError) {
      if (cancelError instanceof SessionExpiredError) {
        expireSession();
        return;
      }
      setError(cancelError instanceof Error ? cancelError.message : "Annulation impossible.");
    }
  }

  async function logout() {
    setLoggingOut(true);
    resetAll({ preserveNotice: true });
    await Promise.resolve();
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      setNotice(response.ok ? "Session fermée." : "État local effacé. La déconnexion serveur a échoué.");
      if (response.ok) setPhase("expired");
    } catch {
      setNotice("État local effacé. La déconnexion serveur a échoué.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <section aria-labelledby="admin-import-title" className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]" id="admin-import-title">
            Importer un run LM Arena
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--text-muted)]">
            Contrôlez l’archive, vérifiez son rendu isolé, puis publiez-la en un seul commit.
          </p>
        </div>
        {phase !== "expired" && (
          <button
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:opacity-60"
            disabled={loggingOut}
            onClick={logout}
            type="button"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" />
            {loggingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        )}
      </div>

      <ol aria-label="Étapes de l’import" className="mt-8 grid gap-2 sm:grid-cols-4">
        {steps.map((step) => {
          const complete = activeStep > step.number || phase === "success";
          const active = activeStep === step.number && phase !== "success";
          return (
            <li
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm ${
                active
                  ? "border-[var(--accent)] bg-cyan-400/10 text-[var(--text-primary)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]"
              }`}
              key={step.number}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                complete ? "bg-[var(--success)] text-slate-950" : active ? "bg-[var(--accent)] text-slate-950" : "bg-[var(--surface-raised)]"
              }`}>
                {complete ? <Check aria-hidden="true" className="h-4 w-4" /> : step.number}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 min-h-6">
        {notice && (
          <p className="flex items-center gap-2 text-sm text-[var(--success)]" role="status">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            {notice}
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 text-sm text-[var(--danger)]" role="alert">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>

      {phase === "expired" ? (
        <div className="mt-4 rounded-2xl border border-[var(--danger)]/60 bg-rose-950/20 p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Connexion requise</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Les fichiers, reçus et jetons du brouillon ont été retirés de cette page.
          </p>
          <a
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-slate-950"
            href="/admin/import"
          >
            Se reconnecter
          </a>
        </div>
      ) : phase === "success" && published ? (
        <div className="mt-4 rounded-2xl border border-[var(--success)]/60 bg-teal-950/20 p-6 sm:p-8">
          <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-[var(--success)]" />
          <h2 className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">Run publié</h2>
          <p className="mt-2 text-[var(--text-muted)]">Le run est maintenant disponible dans l’explorateur public.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-slate-950" href={published.runUrl}>
              Voir le run public
            </a>
            <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[var(--text-primary)]" href={published.taskUrl}>
              Voir la task
            </a>
            <button className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 font-semibold text-[var(--text-primary)]" onClick={() => resetAll()} type="button">
              Importer un autre run
            </button>
          </div>
          {(published.cleanupWarning || published.invalidationWarning) && (
            <div className="mt-6 space-y-2 rounded-xl border border-[var(--warning)]/50 bg-amber-950/20 p-4 text-sm text-[var(--warning)]" role="status">
              {published.cleanupWarning && <p>{published.cleanupWarning}</p>}
              {published.invalidationWarning && <p>{published.invalidationWarning}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
          {(phase === "identify" || phase === "validated" || phase === "uploading") && (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]" htmlFor={taskId}>
                    Task
                  </label>
                  <select
                    className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-[var(--text-primary)] disabled:opacity-60"
                    disabled={phase === "uploading"}
                    id={taskId}
                    onChange={(event) => setTask(event.target.value)}
                    required
                    value={task}
                  >
                    <option value="">Choisir une task existante</option>
                    {canonicalTasks.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]" htmlFor={modelId}>
                    Modèle
                  </label>
                  <input
                    className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-[var(--text-primary)] placeholder:text-slate-500 disabled:opacity-60"
                    disabled={phase === "uploading"}
                    id={modelId}
                    maxLength={100}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="Ex. claude-sonnet-5"
                    required
                    value={model}
                  />
                </div>
                <div>
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Harness</span>
                  <div className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-[var(--text-primary)]">
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--success)]" />
                    <span className="font-medium">lmarena</span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">fixe</span>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]" htmlFor={generationId}>
                    Date de génération (facultatif)
                  </label>
                  <input
                    className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-[var(--text-primary)] disabled:opacity-60"
                    disabled={phase === "uploading"}
                    id={generationId}
                    onChange={(event) => setGenerationTime(event.target.value)}
                    type="datetime-local"
                    value={generationTime}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]" htmlFor={notesId}>
                    Notes (facultatif)
                  </label>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-[var(--text-primary)] placeholder:text-slate-500 disabled:opacity-60"
                    disabled={phase === "uploading"}
                    id={notesId}
                    maxLength={500}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Contexte utile pour les lecteurs du run"
                    value={notes}
                  />
                </div>
              </div>

              <div className="mt-6">
                <ImportDropzone
                  disabled={phase === "uploading"}
                  fileName={archiveName}
                  onFile={chooseArchive}
                />
              </div>

              {inspecting && (
                <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status">
                  <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Inspection locale sans exécution du projet…
                </p>
              )}

              {inspection && (
                <div className="mt-5 rounded-2xl border border-[var(--success)]/50 bg-teal-950/20 p-5">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 aria-hidden="true" className="h-6 w-6 text-[var(--success)]" />
                    <div>
                      <h2 className="font-semibold text-[var(--text-primary)]">Archive valide</h2>
                      <p className="text-sm text-[var(--text-muted)]">Aucun fichier n’a été exécuté dans votre navigateur.</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div><dt className="text-[var(--text-muted)]">Type détecté</dt><dd className="mt-1 font-medium text-[var(--text-primary)]">{inspection.type === "vite-react" ? "Vite · React" : "HTML autonome"}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Point d’entrée</dt><dd className="mt-1 font-medium text-[var(--text-primary)]">{inspection.entryPoint}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Fichiers</dt><dd className="mt-1 font-medium text-[var(--text-primary)]">{inspection.fileCount}</dd></div>
                    <div><dt className="text-[var(--text-muted)]">Taille déployée</dt><dd className="mt-1 font-medium text-[var(--text-primary)]">{bytesLabel(inspection.expandedBytes)}</dd></div>
                  </dl>
                </div>
              )}

              {phase === "uploading" && (
                <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-[var(--text-primary)]">Envoi sécurisé des fichiers</span>
                    <span aria-atomic="true" aria-live="polite" className="text-[var(--text-muted)]" role="status">
                      {progress.complete} sur {progress.total}
                    </span>
                  </div>
                  <progress className="mt-3 h-2 w-full accent-cyan-300" max={Math.max(progress.total, 1)} value={progress.complete}>
                    {progress.complete} sur {progress.total}
                  </progress>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Trois fichiers au maximum sont envoyés en parallèle.</p>
                </div>
              )}

              {inspection && phase !== "uploading" && (
                <>
                  <div className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--warning)]/50 bg-amber-950/20 p-4 text-sm text-amber-100">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" />
                    <p>
                      La prévisualisation crée une branche temporaire non indexée dans le dépôt public. Son nom est imprévisible, mais elle reste techniquement publique jusqu’à l’annulation ou la publication.
                    </p>
                  </div>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    {uploadSession?.failedPaths.length ? (
                      <button
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-slate-950"
                        onClick={retryFailedUploads}
                        type="button"
                      >
                        <UploadCloud aria-hidden="true" className="h-4 w-4" />
                        {uploadSession.failedPaths.length === 1 ? "Réessayer le fichier en échec" : "Réessayer les fichiers en échec"}
                      </button>
                    ) : (
                      <button
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!task || !model.trim()}
                        onClick={beginPreview}
                        type="button"
                      >
                        <UploadCloud aria-hidden="true" className="h-4 w-4" />
                        Créer la prévisualisation
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {(phase === "preview" || phase === "publishing") && draft && (
            <>
              <ImportPreview
                error={previewFailed}
                loaded={previewLoaded}
                metadata={draft.metadata}
                onError={() => {
                  setPreviewLoaded(false);
                  setPreviewFailed(true);
                  setError("La prévisualisation n’a pas pu être chargée. Le brouillon reste disponible.");
                }}
                onLoad={() => {
                  setPreviewFailed(false);
                  setPreviewLoaded(true);
                  setError(null);
                }}
                previewUrl={draft.previewUrl}
              />
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--danger)]/60 px-5 py-3 font-semibold text-[var(--danger)] disabled:opacity-60"
                  disabled={phase === "publishing"}
                  onClick={cancelDraft}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Annuler le brouillon
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!previewLoaded || previewFailed || phase === "publishing"}
                  onClick={publishDraft}
                  type="button"
                >
                  {phase === "publishing" ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                  {phase === "publishing" ? "Publication…" : publishFailed ? "Réessayer la publication" : "Publier le run"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
