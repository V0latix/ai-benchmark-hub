import { strToU8, zipSync } from "fflate";
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

  it("rejects archives with more than one thousand files before extraction", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [`download/${index}.txt`, strToU8("x")])
    );

    await expect(inspectArchive(zipSync(files))).rejects.toThrow(/1,000 files/i);
  });

  it("rejects archives whose metadata exceeds the expanded or individual-file bounds", async () => {
    const largeFile = zipSync({ "index.html": strToU8("<html></html>"), "assets/large.js": new Uint8Array(3_000_001) });
    await expect(inspectArchive(largeFile)).rejects.toThrow(/3 MB/i);
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
});
