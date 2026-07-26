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
const archiveSignatures = [
  [0x50, 0x4b, 0x03, 0x04], // ZIP
  [0x50, 0x4b, 0x05, 0x06], // empty ZIP
  [0x1f, 0x8b], // GZIP
  [0x52, 0x61, 0x72, 0x21], // RAR
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] // 7-Zip
] as const;
const binarySignatures: Record<string, (bytes: Uint8Array) => boolean> = {
  avif: (bytes) =>
    bytes.byteLength >= 12 &&
    startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70]) &&
    (startsWith(bytes.subarray(8), [0x61, 0x76, 0x69, 0x66]) || startsWith(bytes.subarray(8), [0x61, 0x76, 0x69, 0x73])),
  gif: (bytes) => startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  jpeg: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  jpg: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  png: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: (bytes) => bytes.byteLength >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  woff: (bytes) => startsWith(bytes, [0x77, 0x4f, 0x46, 0x46]),
  woff2: (bytes) => startsWith(bytes, [0x77, 0x4f, 0x46, 0x32])
};

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

function hasArchiveMagic(bytes: Uint8Array) {
  return archiveSignatures.some((signature) => startsWith(bytes, signature)) ||
    (bytes.byteLength > 262 && startsWith(bytes.subarray(257), [0x75, 0x73, 0x74, 0x61, 0x72]));
}

function hasPrivateKeyMagic(bytes: Uint8Array) {
  const prefix = new TextDecoder("utf-8").decode(bytes.subarray(0, Math.min(bytes.byteLength, 8_192)));
  return /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i.test(prefix);
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
  if (hasArchiveMagic(input.bytes)) throw new Error(`Archive file signature is not allowed: ${path}`);
  if (hasPrivateKeyMagic(input.bytes)) throw new Error(`Private key or secret signature is not allowed: ${path}`);

  const fileExtension = extension(path);
  const rule = fileRules[fileExtension];
  if (!rule) throw new Error(`Unsupported import file type: ${path}`);

  if (!rule.text && !binarySignatures[fileExtension]?.(input.bytes)) {
    throw new Error(`Binary file signature does not match its extension: ${path}`);
  }

  const declaredContentType = input.contentType.split(";", 1)[0].trim().toLowerCase();
  const canonicalContentType = rule.contentType.split(";", 1)[0].toLowerCase();
  if (declaredContentType && declaredContentType !== "application/octet-stream" && declaredContentType !== canonicalContentType) {
    throw new Error(`Declared content type does not match file contents: ${path}`);
  }

  if (rule.text) {
    const value = readText(input.bytes, path);
    if (containsCredential(value)) throw new Error(`Likely credential or private key is not allowed: ${path}`);
  }

  return { path, bytes: input.bytes, contentType: rule.contentType, text: rule.text };
}
