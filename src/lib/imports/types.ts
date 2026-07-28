export const IMPORT_LIMITS = {
  compressedBytes: 20_000_000,
  expandedBytes: 75_000_000,
  fileBytes: 3_000_000,
  textFileBytes: 750_000,
  fileCount: 1_000,
  archiveEntryCount: 1_000
} as const;

export type ImportProjectType = "standalone-html" | "vite-react";

export type ValidatedImportFile = {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  text: boolean;
};

export type ArchiveInspection = {
  files: ValidatedImportFile[];
  type: ImportProjectType;
  entryPoint: "index.html";
  compressedBytes: number;
  expandedBytes: number;
  fileCount: number;
  warnings: string[];
};
