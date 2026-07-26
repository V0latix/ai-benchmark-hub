import { IMPORT_LIMITS, type ValidatedImportFile } from "./types";

type ImportFileInput = {
  path: string;
  bytes: Uint8Array;
  contentType: string;
};

type FileRule = {
  contentType: string;
  text: boolean;
};

const fileRules: Record<string, FileRule> = {
  avif: { contentType: "image/avif", text: false },
  css: { contentType: "text/css; charset=utf-8", text: true },
  csv: { contentType: "text/csv; charset=utf-8", text: true },
  gif: { contentType: "image/gif", text: false },
  htm: { contentType: "text/html; charset=utf-8", text: true },
  html: { contentType: "text/html; charset=utf-8", text: true },
  jpeg: { contentType: "image/jpeg", text: false },
  jpg: { contentType: "image/jpeg", text: false },
  js: { contentType: "text/javascript; charset=utf-8", text: true },
  json: { contentType: "application/json; charset=utf-8", text: true },
  jsx: { contentType: "text/javascript; charset=utf-8", text: true },
  md: { contentType: "text/markdown; charset=utf-8", text: true },
  mjs: { contentType: "text/javascript; charset=utf-8", text: true },
  png: { contentType: "image/png", text: false },
  svg: { contentType: "image/svg+xml", text: true },
  text: { contentType: "text/plain; charset=utf-8", text: true },
  ts: { contentType: "text/javascript; charset=utf-8", text: true },
  tsx: { contentType: "text/javascript; charset=utf-8", text: true },
  txt: { contentType: "text/plain; charset=utf-8", text: true },
  webmanifest: { contentType: "application/manifest+json; charset=utf-8", text: true },
  webp: { contentType: "image/webp", text: false },
  woff: { contentType: "font/woff", text: false },
  woff2: { contentType: "font/woff2", text: false },
  xml: { contentType: "application/xml; charset=utf-8", text: true },
  yaml: { contentType: "text/yaml; charset=utf-8", text: true },
  yml: { contentType: "text/yaml; charset=utf-8", text: true }
};

const prohibitedName = /(?:^|\/)(?:\.env(?:\..*)?|(?:id_|.*(?:credential|secret|private[_-]?key|password|token|keyring).*)|(?:.*\.map)|(?:.*\.(?:zip|tar|tgz|gz|rar|7z|exe|dll|dylib|so|sh|bat|cmd|ps1|php|py|rb|java|class)))(?:$|\/)/i;
const prohibitedServerPath = /(?:^|\/)(?:api|server|functions)(?:\/|$)/i;
const executableSignatures = [
  [0x4d, 0x5a], // MZ
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xfe, 0xed, 0xfa, 0xce], // Mach-O 32-bit
  [0xfe, 0xed, 0xfa, 0xcf], // Mach-O 64-bit
  [0xce, 0xfa, 0xed, 0xfe], // Mach-O 32-bit, little endian
  [0xcf, 0xfa, 0xed, 0xfe] // Mach-O 64-bit, little endian
] as const;

function extension(path: string) {
  const basename = path.slice(path.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? "" : basename.slice(dot + 1).toLowerCase();
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function isExecutable(bytes: Uint8Array) {
  return executableSignatures.some((signature) => startsWith(bytes, signature));
}

function readText(bytes: Uint8Array, path: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Text file is not valid UTF-8: ${path}`);
  }
}

function containsCredential(text: string) {
  return /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i.test(text) ||
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b\s*(?:=|:)\s*["'`]?[A-Za-z0-9_./+=-]{8,}/i.test(text);
}

/**
 * Normalizes a published path and rejects every form that could resolve to a
 * different path on another platform. This module deliberately has no Node or
 * server-only imports: browser inspection and upload routes use the exact same
 * policy.
 */
export function normalizeImportPath(path: string): string {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    throw new Error(`Unsafe import path: ${path || "(empty)"}`);
  }

  const normalized = path.normalize("NFC");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe import path: ${path}`);
  }

  return normalized;
}

/** A case-folded key prevents collisions on common case-insensitive filesystems. */
export function importPathKey(path: string): string {
  return normalizeImportPath(path).toLocaleLowerCase("en-US");
}

export function validateImportFile(input: ImportFileInput): ValidatedImportFile {
  const path = normalizeImportPath(input.path);
  if (input.bytes.byteLength > IMPORT_LIMITS.fileBytes) {
    throw new Error(`Import file exceeds the 3 MB limit: ${path}`);
  }
  if (prohibitedName.test(path) || prohibitedServerPath.test(path)) {
    throw new Error(`Import file name is not allowed: ${path}`);
  }
  if (isExecutable(input.bytes)) {
    throw new Error(`Executable file signature is not allowed: ${path}`);
  }

  const rule = fileRules[extension(path)];
  if (!rule) throw new Error(`Unsupported import file type: ${path}`);

  if (rule.text) {
    const value = readText(input.bytes, path);
    if (containsCredential(value)) throw new Error(`Likely credential or private key is not allowed: ${path}`);
  }

  return { path, bytes: input.bytes, contentType: rule.contentType, text: rule.text };
}
