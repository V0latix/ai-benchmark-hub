"use client";

import { useId, useState, type DragEvent } from "react";
import { FileArchive, UploadCloud } from "lucide-react";

type ImportDropzoneProps = {
  disabled?: boolean;
  fileName: string | null;
  onFile: (file: File) => void;
};

export function ImportDropzone({
  disabled = false,
  fileName,
  onFile
}: ImportDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function acceptDroppedFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0] ?? event.dataTransfer.files.item?.(0);
    if (file) onFile(file);
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
        Archive LM Arena
      </span>
      <label
        className={`group flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center transition-colors ${
          dragging
            ? "border-[var(--accent)] bg-cyan-400/10"
            : "border-[var(--border)] bg-[var(--canvas)] hover:border-[var(--accent)]"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        htmlFor={inputId}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={acceptDroppedFile}
      >
        {fileName ? (
          <>
            <FileArchive aria-hidden="true" className="h-7 w-7 text-[var(--success)]" />
            <span className="mt-3 break-all font-medium text-[var(--text-primary)]">{fileName}</span>
            <span className="mt-1 text-sm text-[var(--text-muted)]">Choisir une autre archive ZIP</span>
          </>
        ) : (
          <>
            <UploadCloud aria-hidden="true" className="h-8 w-8 text-[var(--accent)]" />
            <span className="mt-3 font-medium text-[var(--text-primary)]">
              Déposez le ZIP ici ou parcourez vos fichiers
            </span>
            <span className="mt-1 text-sm text-[var(--text-muted)]">20 Mo compressés maximum</span>
          </>
        )}
        <input
          accept=".zip,application/zip"
          aria-label="Archive LM Arena"
          className="sr-only"
          disabled={disabled}
          id={inputId}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? event.target.files?.item?.(0);
            if (file) onFile(file);
            event.target.value = "";
          }}
          type="file"
        />
      </label>
    </div>
  );
}
