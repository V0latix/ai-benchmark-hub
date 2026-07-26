import { unzip } from "fflate";

import { importPathKey, normalizeImportPath, validateImportFile } from "./policy";
import { IMPORT_LIMITS, type ArchiveInspection, type ImportProjectType, type ValidatedImportFile } from "./types";

type ZipEntry = {
  path: string;
  compressedBytes: number;
  expandedBytes: number;
  directory: boolean;
};

const centralDirectorySignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const zip64Sentinel = 0xffff;
const zip64OffsetSentinel = 0xffffffff;
const supportedCompressionMethods = new Set([0, 8]);

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
  if (entryCount > IMPORT_LIMITS.fileCount) throw new Error("Archive exceeds the 1,000 files limit");

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || view.getUint32(offset, true) !== centralDirectorySignature) {
      throw new Error("Archive central directory is malformed");
    }

    const versionMadeBy = view.getUint16(offset + 4, true);
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const fileExpandedBytes = view.getUint32(offset + 24, true);
    const pathLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const externalAttributes = view.getUint32(offset + 38, true);
    const nameStart = offset + 46;
    const nextOffset = nameStart + pathLength + extraLength + commentLength;
    if (nextOffset > endOffset) throw new Error("Archive central directory is malformed");
    if (!supportedCompressionMethods.has(compressionMethod)) throw new Error("Archive uses an unsupported compression method");

    const path = decodeZipName(data.subarray(nameStart, nameStart + pathLength), flags);
    const directory = path.endsWith("/");
    const hostSystem = versionMadeBy >> 8;
    const unixFileType = (externalAttributes >>> 16) & 0xf000;
    if (hostSystem === 3 && unixFileType !== 0 && unixFileType !== 0x8000 && unixFileType !== 0x4000) {
      throw new Error(`Symlink or device ZIP entry is not allowed: ${path}`);
    }

    const safePath = directory ? normalizeDirectoryPath(path) : normalizeImportPath(path);
    if (!directory && fileExpandedBytes > IMPORT_LIMITS.fileBytes) {
      throw new Error(`Import file exceeds the 3 MB limit: ${safePath}`);
    }
    expandedBytes += fileExpandedBytes;
    if (expandedBytes > IMPORT_LIMITS.expandedBytes) throw new Error("Archive exceeds the 75 MB expanded limit");
    entries.push({ path: safePath, compressedBytes, expandedBytes: fileExpandedBytes, directory });
    offset = nextOffset;
  }

  for (const entry of entries) {
    if (entry.expandedBytes > 1_000_000 && (entry.compressedBytes === 0 || entry.expandedBytes / entry.compressedBytes > 100)) {
      throw new Error(`Archive has an unsafe compression ratio: ${entry.path}`);
    }
  }

  return entries;
}

function normalizeDirectoryPath(path: string) {
  if (!path.endsWith("/")) throw new Error(`Unsafe import path: ${path}`);
  return normalizeImportPath(path.slice(0, -1));
}

function unzipArchive(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, files) => {
      if (error) reject(new Error("Archive could not be extracted safely"));
      else resolve(files);
    });
  });
}

function stripCommonRoot(files: Record<string, Uint8Array>) {
  const paths = Object.keys(files);
  const firstSegments = new Set(paths.map((path) => path.split("/", 1)[0]));
  const allNested = paths.every((path) => path.includes("/"));
  if (firstSegments.size !== 1 || !allNested) return files;

  const root = `${paths[0].split("/", 1)[0]}/`;
  return Object.fromEntries(paths.map((path) => [path.slice(root.length), files[path]]));
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
  const sourceMatch = html.match(/<script[^>]+\bsrc=["'](?:\.?\/)?(src\/main\.(?:jsx|tsx))["'][^>]*>/i);
  if (!sourceMatch) return "standalone-html";

  const packageJson = parsePackageJson(byPath.get("package.json"));
  const dependencies = { ...packageJson?.devDependencies, ...packageJson?.dependencies };
  if (!packageJson || typeof dependencies.react !== "string" || !byPath.has(sourceMatch[1])) {
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
  const archiveFiles = await unzipArchive(data);
  const expectedFiles = entries.filter((entry) => !entry.directory);
  if (Object.keys(archiveFiles).length !== expectedFiles.length) {
    throw new Error("Archive extraction did not preserve every file");
  }

  const strippedFiles = stripCommonRoot(archiveFiles);
  const files = Object.entries(strippedFiles).map(([path, bytes]) =>
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
