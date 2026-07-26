import { Unzip, UnzipInflate } from "fflate";

import { importPathKey, normalizeImportPath, validateImportFile } from "./policy";
import { IMPORT_LIMITS, type ArchiveInspection, type ImportProjectType, type ValidatedImportFile } from "./types";

type ZipEntry = {
  path: string;
  compressedBytes: number;
  expandedBytes: number;
  crc32: number;
  compression: number;
  directory: boolean;
};

const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const localFileHeaderSignature = 0x04034b50;
const zip64Sentinel = 0xffff;
const zip64OffsetSentinel = 0xffffffff;
const supportedCompressionMethods = new Set([0, 8]);
const extractionChunkBytes = 1_024;
const crc32Table = new Uint32Array(256);

for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crc32Table[index] = value >>> 0;
}

class ArchiveExtractionError extends Error {}

function updateCrc32(state: number, bytes: Uint8Array) {
  let value = state;
  for (const byte of bytes) value = crc32Table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function findEndOfCentralDirectory(data: Uint8Array) {
  const minimumOffset = Math.max(0, data.length - 65_557);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = data.length - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === endOfCentralDirectorySignature) return offset;
  }
  throw new Error("Archive is not a valid ZIP file");
}

function decodeZipName(bytes: Uint8Array, flags: number) {
  if ((flags & 0x0800) === 0 && bytes.some((byte) => byte > 0x7f)) {
    throw new Error("Archive uses an unsupported legacy filename encoding");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Archive contains an invalid filename");
  }
}

function readZipEntries(data: Uint8Array): ZipEntry[] {
  if (data.byteLength > IMPORT_LIMITS.compressedBytes) {
    throw new Error("Archive exceeds the 20 MB compressed limit");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endOffset = findEndOfCentralDirectory(data);
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralOffset = view.getUint32(endOffset + 16, true);

  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error("Multi-disk ZIP archives are not allowed");
  if (entryCount === zip64Sentinel || centralOffset === zip64OffsetSentinel) throw new Error("ZIP64 archives are not allowed");
  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let expandedBytes = 0;
  let fileCount = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== centralDirectorySignature) {
      throw new Error("Archive central directory is malformed");
    }

    const versionMadeBy = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const fileExpandedBytes = view.getUint32(offset + 24, true);
    const pathLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const nextOffset = nameStart + pathLength + extraLength + commentLength;
    if (nextOffset > endOffset) throw new Error("Archive central directory is malformed");
    if (!supportedCompressionMethods.has(compressionMethod)) throw new Error("Archive uses an unsupported compression method");
    if (localOffset + 30 > data.byteLength || view.getUint32(localOffset, true) !== localFileHeaderSignature) {
      throw new Error("Archive local file header is malformed");
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    if ((flags & 0x0008) !== 0 || (localFlags & 0x0008) !== 0) {
      throw new Error("ZIP data descriptor entries are unsupported");
    }

    const path = decodeZipName(data.subarray(nameStart, nameStart + pathLength), flags);
    const directory = path.endsWith("/");
    const hostSystem = versionMadeBy >> 8;
    const unixFileType = (externalAttributes >>> 16) & 0xf000;
    if (hostSystem === 3 && unixFileType !== 0 && unixFileType !== 0x8000 && unixFileType !== 0x4000) {
      throw new Error(`Symlink or device ZIP entry is not allowed: ${path}`);
    }

    const safePath = directory ? normalizeDirectoryPath(path) : normalizeImportPath(path);
    if (directory && fileExpandedBytes !== 0) throw new Error(`Directory ZIP entry contains file data: ${safePath}`);
    if (!directory && ++fileCount > IMPORT_LIMITS.fileCount) throw new Error("Archive exceeds the 1,000 files limit");
    if (!directory && fileExpandedBytes > IMPORT_LIMITS.fileBytes) {
      throw new Error(`Import file exceeds the 3 MB limit: ${safePath}`);
    }
    if (!directory) expandedBytes += fileExpandedBytes;
    if (expandedBytes > IMPORT_LIMITS.expandedBytes) throw new Error("Archive exceeds the 75 MB expanded limit");
    entries.push({ path: safePath, compressedBytes, expandedBytes: fileExpandedBytes, crc32, compression: compressionMethod, directory });
    offset = nextOffset;
  }

  for (const entry of entries) {
    if (!entry.directory && entry.expandedBytes > 1_000_000 && (entry.compressedBytes === 0 || entry.expandedBytes / entry.compressedBytes > 100)) {
      throw new Error(`Archive has an unsafe compression ratio: ${entry.path}`);
    }
  }

  return entries;
}

function normalizeDirectoryPath(path: string) {
  if (!path.endsWith("/")) throw new Error(`Unsafe import path: ${path}`);
  return normalizeImportPath(path.slice(0, -1));
}

type ExtractedFile = { path: string; bytes: Uint8Array };

function entryKey(path: string, directory: boolean) {
  return `${directory ? "directory" : "file"}:${path}`;
}

function concatenateChunks(chunks: Uint8Array[], size: number) {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function streamArchive(data: Uint8Array, entries: ZipEntry[]): ExtractedFile[] {
  const expected = new Map<string, ZipEntry>();
  for (const entry of entries) {
    const key = entryKey(entry.path, entry.directory);
    if (expected.has(key)) throw new Error(`Duplicate ZIP entry: ${entry.path}`);
    expected.set(key, entry);
  }

  const seen = new Set<string>();
  const extracted: ExtractedFile[] = [];
  let emittedBytes = 0;
  let emittedFiles = 0;

  const unzipper = new Unzip((file) => {
    const directory = file.name.endsWith("/");
    const path = directory ? normalizeDirectoryPath(file.name) : normalizeImportPath(file.name);
    const key = entryKey(path, directory);
    const metadata = expected.get(key);
    if (!metadata || seen.has(key)) throw new ArchiveExtractionError(`Archive entry metadata mismatch: ${path}`);
    seen.add(key);

    if (file.compression !== metadata.compression) {
      throw new ArchiveExtractionError(`Archive compression metadata mismatch: ${path}`);
    }
    if (file.size !== undefined && file.size !== metadata.compressedBytes) {
      throw new ArchiveExtractionError(`Archive compressed-size mismatch: ${path}`);
    }
    if (file.originalSize !== undefined && file.originalSize !== metadata.expandedBytes) {
      throw new ArchiveExtractionError(`Archive expanded-size mismatch: ${path}`);
    }
    if (!directory && ++emittedFiles > IMPORT_LIMITS.fileCount) {
      file.terminate();
      throw new ArchiveExtractionError("Archive exceeds the 1,000 files limit");
    }

    const chunks: Uint8Array[] = [];
    let fileBytes = 0;
    let crcState = 0xffffffff;
    file.ondata = (error, chunk, final) => {
      if (error) {
        file.terminate();
        if (error instanceof ArchiveExtractionError) throw error;
        throw new ArchiveExtractionError(`Archive is corrupt or truncated: ${path}`);
      }

      fileBytes += chunk.byteLength;
      emittedBytes += chunk.byteLength;
      if (fileBytes > IMPORT_LIMITS.fileBytes) {
        file.terminate();
        throw new ArchiveExtractionError(`Import file exceeds the 3 MB limit: ${path}`);
      }
      if (emittedBytes > IMPORT_LIMITS.expandedBytes) {
        file.terminate();
        throw new ArchiveExtractionError("Archive exceeds the 75 MB expanded limit");
      }
      if (directory && fileBytes !== 0) {
        file.terminate();
        throw new ArchiveExtractionError(`Directory ZIP entry contains file data: ${path}`);
      }

      crcState = updateCrc32(crcState, chunk);
      if (!directory && chunk.byteLength) chunks.push(chunk);
      if (!final) return;

      if (fileBytes !== metadata.expandedBytes) {
        throw new ArchiveExtractionError(`Archive expanded-size mismatch: ${path}`);
      }
      if (((crcState ^ 0xffffffff) >>> 0) !== metadata.crc32) {
        throw new ArchiveExtractionError(`Archive CRC checksum mismatch: ${path}`);
      }
      if (!directory) extracted.push({ path, bytes: concatenateChunks(chunks, fileBytes) });
    };
    file.start();
  });
  unzipper.register(UnzipInflate);

  try {
    for (let offset = 0; offset < data.byteLength; offset += extractionChunkBytes) {
      const end = Math.min(offset + extractionChunkBytes, data.byteLength);
      unzipper.push(data.subarray(offset, end), end === data.byteLength);
    }
  } catch (error) {
    if (error instanceof ArchiveExtractionError) throw error;
    throw new Error("Archive is corrupt or truncated");
  }

  if (seen.size !== expected.size || extracted.length !== emittedFiles) {
    throw new Error("Archive is corrupt, truncated, or has inconsistent entries");
  }
  return extracted;
}

function stripCommonRoot(files: ExtractedFile[]) {
  const paths = files.map((file) => file.path);
  const firstSegments = new Set(paths.map((path) => path.split("/", 1)[0]));
  const allNested = paths.every((path) => path.includes("/"));
  if (firstSegments.size !== 1 || !allNested) return files;

  const root = `${paths[0].split("/", 1)[0]}/`;
  return files.map((file) => ({ ...file, path: file.path.slice(root.length) }));
}

function assertUniquePaths(files: ValidatedImportFile[]) {
  const paths = new Set<string>();
  for (const file of files) {
    const key = importPathKey(file.path);
    if (paths.has(key)) throw new Error(`Duplicate normalized import path: ${file.path}`);
    paths.add(key);
  }
}

function parsePackageJson(file: ValidatedImportFile | undefined) {
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(file.bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
  } catch {
    return null;
  }
}

function detectProject(files: ValidatedImportFile[]): ImportProjectType {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const index = byPath.get("index.html");
  if (!index) throw new Error("Archive has no supported entry point (index.html)");

  const html = new TextDecoder().decode(index.bytes);
  const viteLikeScript = html.match(/<script\b[^>]*\bsrc=["'](?:\.?\/)?src\/main\.(?:jsx|tsx)["'][^>]*>/i)?.[0];
  if (!viteLikeScript) return "standalone-html";
  const viteScript = html.match(/<script\b[^>]*\bsrc=["']\/src\/main\.(?:jsx|tsx)["'][^>]*>\s*<\/script>/i)?.[0];
  if (!viteScript) throw new Error("Archive has no supported Vite React entry point");
  const supportedScript = /\bsrc=["']\/src\/main\.tsx["']/i.test(viteScript) &&
    /\btype=["']module["']/i.test(viteScript);
  if (!supportedScript) throw new Error("Archive has no supported Vite React entry point");

  const packageJson = parsePackageJson(byPath.get("package.json"));
  const dependencies = { ...packageJson?.devDependencies, ...packageJson?.dependencies };
  if (!packageJson || typeof dependencies.react !== "string" || !byPath.has("src/main.tsx")) {
    throw new Error("Archive has no supported Vite React entry point");
  }
  return "vite-react";
}

/**
 * Browser-only early archive inspection. It deliberately expands untrusted ZIP
 * data but never imports, evaluates, builds, or renders any extracted project
 * file. Upload routes reuse policy.ts and independently validate every file.
 */
export async function inspectArchive(data: Uint8Array): Promise<ArchiveInspection> {
  const entries = readZipEntries(data);
  const archiveFiles = streamArchive(data, entries);
  const strippedFiles = stripCommonRoot(archiveFiles);
  const files = strippedFiles.map(({ path, bytes }) =>
    validateImportFile({ path, bytes, contentType: "application/octet-stream" })
  );
  assertUniquePaths(files);
  const type = detectProject(files);

  return {
    files,
    type,
    entryPoint: "index.html",
    compressedBytes: data.byteLength,
    expandedBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0),
    fileCount: files.length,
    warnings: []
  };
}
