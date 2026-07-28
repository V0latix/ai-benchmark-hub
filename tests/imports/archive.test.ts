import { strToU8, Zip, ZipDeflate, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { inspectArchive } from "../../src/lib/imports/archive";

function centralDirectoryOffset(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let offset = data.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return view.getUint32(offset + 16, true);
  }
  throw new Error("test ZIP has no central directory");
}

function setCentralDirectoryExpandedBytes(data: Uint8Array, expandedBytes: number) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = centralDirectoryOffset(data);
  let entries = 0;
  while (view.getUint32(offset, true) === 0x02014b50) {
    view.setUint32(offset + 24, expandedBytes, true);
    entries += 1;
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return entries;
}

function setDeclaredExpandedBytes(data: Uint8Array, path: string, expandedBytes: number) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = centralDirectoryOffset(data);
  while (view.getUint32(offset, true) === 0x02014b50) {
    const pathLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + pathLength));
    if (name === path) {
      const localOffset = view.getUint32(offset + 42, true);
      view.setUint32(offset + 24, expandedBytes, true);
      view.setUint32(localOffset + 22, expandedBytes, true);
      return;
    }
    offset += 46 + pathLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  throw new Error(`test ZIP has no ${path} entry`);
}

function corruptStoredFile(data: Uint8Array, path: string) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();
  let offset = centralDirectoryOffset(data);
  while (view.getUint32(offset, true) === 0x02014b50) {
    const pathLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + pathLength));
    if (name === path) {
      const localOffset = view.getUint32(offset + 42, true);
      const localPathLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      data[localOffset + 30 + localPathLength + localExtraLength] ^= 0xff;
      return;
    }
    offset += 46 + pathLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  throw new Error(`test ZIP has no ${path} entry`);
}

function makeDataDescriptorZip(path: string, bytes: Uint8Array) {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  const file = new ZipDeflate(path);
  zip.add(file);
  file.push(bytes, true);
  zip.end();

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const archive = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
}

function forgeCentralCompressedBytes(data: Uint8Array, compressedBytes: number) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const offset = centralDirectoryOffset(data);
  expect(view.getUint16(offset + 8, true) & 0x0008).toBe(0x0008);
  view.setUint32(offset + 20, compressedBytes, true);
}

describe("archive inspection", () => {
  it("detects a built static archive beneath one common root folder", async () => {
    const zip = zipSync({
      "download/index.html": strToU8("<html></html>"),
      "download/assets/app.js": strToU8("console.log('ok')")
    });

    await expect(inspectArchive(zip)).resolves.toMatchObject({
      type: "standalone-html",
      entryPoint: "index.html",
      fileCount: 2,
      expandedBytes: 30
    });
    await expect(inspectArchive(zip)).resolves.toMatchObject({
      files: expect.arrayContaining([expect.objectContaining({ path: "assets/app.js" })])
    });
  });

  it("detects a supported Vite React entry", async () => {
    const zip = zipSync({
      "index.html": strToU8('<script type="module" src="/src/main.tsx"></script>'),
      "package.json": strToU8('{"dependencies":{"react":"^19.0.0"}}'),
      "src/main.tsx": strToU8("export default null")
    });

    await expect(inspectArchive(zip)).resolves.toMatchObject({ type: "vite-react", entryPoint: "index.html" });
  });

  it("rejects a Vite main.jsx entry that the preview loader cannot load", async () => {
    const zip = zipSync({
      "index.html": strToU8('<script type="module" src="/src/main.jsx"></script>'),
      "package.json": strToU8('{"dependencies":{"react":"^19.0.0"}}'),
      "src/main.jsx": strToU8("export default null")
    });

    await expect(inspectArchive(zip)).rejects.toThrow(/supported Vite React entry/i);
  });

  it("rejects a Vite main.tsx script without type=module", async () => {
    const zip = zipSync({
      "index.html": strToU8('<script src="/src/main.tsx"></script>'),
      "package.json": strToU8('{"dependencies":{"react":"^19.0.0"}}'),
      "src/main.tsx": strToU8("export default null")
    });

    await expect(inspectArchive(zip)).rejects.toThrow(/supported Vite React entry/i);
  });

  it("rejects a relative Vite entry that the preview injection does not rewrite", async () => {
    const zip = zipSync({
      "index.html": strToU8('<script type="module" src="./src/main.tsx"></script>'),
      "package.json": strToU8('{"dependencies":{"react":"^19.0.0"}}'),
      "src/main.tsx": strToU8("export default null")
    });

    await expect(inspectArchive(zip)).rejects.toThrow(/supported Vite React entry/i);
  });

  it("ignores explicit directory records when stripping a common archive root", async () => {
    const zip = zipSync({
      "download/": new Uint8Array(),
      "download/index.html": strToU8("<html></html>"),
      "download/assets/": new Uint8Array(),
      "download/assets/app.js": strToU8("console.log('ok')")
    });

    await expect(inspectArchive(zip)).resolves.toMatchObject({
      type: "standalone-html",
      fileCount: 2,
      expandedBytes: 30,
      files: expect.arrayContaining([expect.objectContaining({ path: "assets/app.js" })])
    });
  });

  it("rejects archives with no supported standalone or Vite entry point", async () => {
    await expect(inspectArchive(zipSync({ "readme.txt": strToU8("hello") }))).rejects.toThrow(/supported entry/i);
  });

  it("rejects duplicate paths after case-insensitive normalization", async () => {
    const zip = zipSync({
      "index.html": strToU8("<html></html>"),
      "Assets/app.js": strToU8("one"),
      "assets/APP.js": strToU8("two")
    });

    await expect(inspectArchive(zip)).rejects.toThrow(/duplicate/i);
  });

  it("rejects a compressed archive over 20 MB before extraction", async () => {
    await expect(inspectArchive(new Uint8Array(20_000_001))).rejects.toThrow(/20 MB/i);
  });

  it("rejects archives with more than one thousand file entries before extraction", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [`download/${index}.txt`, strToU8("x")])
    );

    await expect(inspectArchive(zipSync(files))).rejects.toThrow(/1,000 entries/i);
  });

  it("rejects archives with more than one thousand total entries, including directories", async () => {
    const directories = Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [`folders/${index}/`, new Uint8Array()])
    );

    await expect(inspectArchive(zipSync(directories))).rejects.toThrow(/1,000 entries/i);
  });

  it("rejects archives whose metadata exceeds the expanded or individual-file bounds", async () => {
    const largeFile = zipSync({ "index.html": strToU8("<html></html>"), "assets/large.js": new Uint8Array(3_000_001) });
    await expect(inspectArchive(largeFile)).rejects.toThrow(/3 MB/i);
  });

  it("bounds emitted bytes when both local and central size metadata lie", async () => {
    const zip = zipSync({
      "index.html": strToU8("<html></html>"),
      "assets/large.js": new Uint8Array(3_000_001)
    });
    const tampered = zip.slice();
    setDeclaredExpandedBytes(tampered, "assets/large.js", 1);

    await expect(inspectArchive(tampered)).rejects.toThrow(/3 MB/i);
  });

  it("rejects stored file bytes that do not match the central-directory CRC", async () => {
    const zip = zipSync({ "index.html": [strToU8("<html></html>"), { level: 0 }] });
    const tampered = zip.slice();
    corruptStoredFile(tampered, "index.html");

    await expect(inspectArchive(tampered)).rejects.toThrow(/corrupt|CRC|checksum/i);
  });

  it("rejects data-descriptor entries before forged central compressed sizes can bypass validation", async () => {
    const zip = makeDataDescriptorZip("index.html", strToU8("<html></html>"));
    forgeCentralCompressedBytes(zip, 1);

    await expect(inspectArchive(zip)).rejects.toThrow(/data descriptor|unsupported/i);
  });

  it("rejects an archive whose central-directory metadata exceeds the 75 MB expanded bound", async () => {
    const zip = zipSync(Object.fromEntries([
      ["index.html", strToU8("<html></html>")],
      ...Array.from({ length: 25 }, (_, index) => [`assets/${index}.js`, strToU8("x")])
    ]));
    const tampered = zip.slice();
    expect(setCentralDirectoryExpandedBytes(tampered, 3_000_000)).toBe(26);

    await expect(inspectArchive(tampered)).rejects.toThrow(/75 MB/i);
  });

  it("rejects a Unix symlink entry before extracting its target bytes", async () => {
    const zip = zipSync({ "index.html": strToU8("<html></html>") });
    const tampered = zip.slice();
    const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const entryOffset = centralDirectoryOffset(tampered);
    view.setUint16(entryOffset + 4, 3 << 8, true);
    view.setUint32(entryOffset + 38, (0o120777 << 16) >>> 0, true);

    await expect(inspectArchive(tampered)).rejects.toThrow(/symlink|device/i);
  });

  it("rejects traversal, secret files, nested archives, and source maps before a preview can load", async () => {
    for (const path of ["../index.html", ".env", "payload.zip", "assets/app.js.map"]) {
      const zip = zipSync({ [path]: strToU8("<html></html>") });
      await expect(inspectArchive(zip)).rejects.toThrow(/path|not allowed|unsupported/i);
    }
  });

  it("enforces the 750,000-byte text boundary during archive inspection", async () => {
    await expect(inspectArchive(zipSync({
      "index.html": new Uint8Array(750_000).fill(0x61)
    }, { level: 0 }))).resolves.toMatchObject({ fileCount: 1, expandedBytes: 750_000 });

    await expect(inspectArchive(zipSync({
      "index.html": new Uint8Array(750_001).fill(0x61)
    }, { level: 0 }))).rejects.toThrow(/750,000-byte text limit/i);
  });
});
