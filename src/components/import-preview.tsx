"use client";

import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { useEffect, useRef } from "react";

import { adminPreviewInitMessageType, adminPreviewMessageType } from "../lib/visuals/preview";

type ImportPreviewProps = {
  error: boolean;
  loaded: boolean;
  metadata: {
    task: string;
    model: string;
    harness: "lmarena";
    createdAt: string;
    notes: string;
  };
  nonce: string;
  onError: (generation: number) => void;
  onFrameLoad: (generation: number) => void;
  onReady: (generation: number) => void;
  previewUrl: string;
};

export function ImportPreview({
  error,
  loaded,
  metadata,
  nonce,
  onError,
  onFrameLoad,
  onReady,
  previewUrl
}: ImportPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameLoaded = useRef(false);
  const generation = useRef(0);
  const onErrorRef = useRef(onError);
  const onFrameLoadRef = useRef(onFrameLoad);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onErrorRef.current = onError;
    onFrameLoadRef.current = onFrameLoad;
    onReadyRef.current = onReady;
  }, [onError, onFrameLoad, onReady]);

  useEffect(() => {
    frameLoaded.current = false;
    generation.current = 0;
    function receiveReadiness(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) return;
      const message = event.data as Record<string, unknown>;
      if (
        Object.keys(message).sort().join(",") !== "generation,nonce,state,type"
        || message.type !== adminPreviewMessageType
        || message.nonce !== nonce
        || !Number.isSafeInteger(message.generation)
        || (message.generation as number) <= 0
        || message.generation !== generation.current
        || (message.state !== "ready" && message.state !== "error")
      ) {
        return;
      }
      if (message.state === "error") {
        onErrorRef.current(generation.current);
      } else if (frameLoaded.current) {
        onReadyRef.current(generation.current);
      }
    }
    window.addEventListener("message", receiveReadiness);
    return () => window.removeEventListener("message", receiveReadiness);
  }, [nonce, previewUrl]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--canvas)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Eye aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
            Aperçu interactif isolé
          </div>
          <span
            aria-atomic="true"
            aria-live="polite"
            className={`inline-flex items-center gap-2 text-xs font-semibold ${
              error ? "text-[var(--danger)]" : loaded ? "text-[var(--success)]" : "text-[var(--warning)]"
            }`}
            role="status"
          >
            {error ? <AlertTriangle aria-hidden="true" className="h-4 w-4" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            {error ? "Échec du chargement" : loaded ? "Aperçu chargé" : "Chargement…"}
          </span>
        </div>
        <iframe
          className="block h-[32rem] w-full bg-white"
          onErrorCapture={() => onErrorRef.current(generation.current)}
          onLoad={() => {
            const nextGeneration = generation.current + 1;
            generation.current = nextGeneration;
            frameLoaded.current = true;
            onFrameLoadRef.current(nextGeneration);
            iframeRef.current?.contentWindow?.postMessage({
              type: adminPreviewInitMessageType,
              nonce,
              generation: nextGeneration
            }, "*");
          }}
          ref={iframeRef}
          sandbox="allow-scripts"
          src={previewUrl}
          title="Prévisualisation du run importé"
        />
      </div>

      <aside className="rounded-2xl border border-[var(--border)] bg-[var(--canvas)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Métadonnées publiées
        </p>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-[var(--text-muted)]">Task</dt>
            <dd className="mt-1 break-words font-medium text-[var(--text-primary)]">{metadata.task}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Modèle</dt>
            <dd className="mt-1 break-words font-medium text-[var(--text-primary)]">{metadata.model}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Harness</dt>
            <dd className="mt-1 font-medium text-[var(--text-primary)]">{metadata.harness}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Généré le</dt>
            <dd className="mt-1 font-medium text-[var(--text-primary)]">
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC"
              }).format(new Date(metadata.createdAt))}
            </dd>
          </div>
          {metadata.notes && (
            <div>
              <dt className="text-[var(--text-muted)]">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-[var(--text-primary)]">{metadata.notes}</dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  );
}
