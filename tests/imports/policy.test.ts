import { describe, expect, it } from "vitest";

import { validateImportFile } from "../../src/lib/imports/policy";

const text = (value: string) => new TextEncoder().encode(value);

describe("import file policy", () => {
  it("accepts supported text and binary web assets with canonical browser content types", () => {
    expect(
      validateImportFile({
        path: "assets/app.js",
        bytes: text("console.log('safe')"),
        contentType: "application/octet-stream"
      })
    ).toMatchObject({ path: "assets/app.js", contentType: "text/javascript; charset=utf-8", text: true });

    expect(
      validateImportFile({
        path: "assets/logo.png",
        bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        contentType: "image/png"
      })
    ).toMatchObject({ path: "assets/logo.png", contentType: "image/png", text: false });
  });

  it.each([
    ["assets/photo.jpg", new Uint8Array([0xff, 0xd8, 0xff])],
    ["assets/animation.gif", text("GIF89a")],
    ["assets/photo.webp", text("RIFF\u0000\u0000\u0000\u0000WEBP")],
    ["assets/photo.avif", new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])],
    ["assets/site.woff", text("wOFF")],
    ["assets/site.woff2", text("wOF2")]
  ])("accepts valid binary magic for %s", (path, bytes) => {
    expect(validateImportFile({ path: path as string, bytes: bytes as Uint8Array, contentType: "application/octet-stream" }))
      .toMatchObject({ path, text: false });
  });

  it("rejects a conflicting declared content type instead of trusting it", () => {
    expect(() => validateImportFile({
      path: "assets/logo.png",
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      contentType: "text/html"
    })).toThrow(/content type/i);
  });

  it("rejects arbitrary, archive, and secret bytes renamed as an allowed image", () => {
    for (const bytes of [
      text("not really a PNG"),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      new Uint8Array([0x1f, 0x8b, 0x08, 0x00]),
      text("-----BEGIN PRIVATE KEY-----\nabc")
    ]) {
      expect(() => validateImportFile({ path: "assets/logo.png", bytes, contentType: "image/png" }))
        .toThrow(/signature|archive|private key|secret/i);
    }
  });

  it.each(["../escape.js", "/absolute.js", "C:\\drive.js", "assets\\app.js", "./index.html", "assets/../index.html", "assets//app.js", "nul\u0000.js"]) (
    "rejects the unsafe archive path %j",
    (path) => {
      expect(() => validateImportFile({ path, bytes: text("ok"), contentType: "text/plain" })).toThrow(/path/i);
    }
  );

  it("rejects server code, nested archives, source maps, and secret-bearing names", () => {
    for (const path of [".env", "credentials.json", "keys/id_rsa", "api/server.ts", "assets/app.js.map", "payload.zip", "script.sh", "app.exe"]) {
      expect(() => validateImportFile({ path, bytes: text("safe"), contentType: "text/plain" })).toThrow(/not allowed|unsupported/i);
    }
  });

  it("rejects executable file signatures even when the extension claims to be a web asset", () => {
    expect(() =>
      validateImportFile({
        path: "assets/app.js",
        bytes: new Uint8Array([0x7f, 0x45, 0x4c, 0x46]),
        contentType: "text/javascript"
      })
    ).toThrow(/executable/i);
  });

  it("rejects private keys and likely credential assignments in text", () => {
    for (const value of [
      "-----BEGIN PRIVATE KEY-----\\nabc",
      'const API_KEY = "super-secret-value";'
    ]) {
      expect(() =>
        validateImportFile({ path: "src/config.ts", bytes: text(value), contentType: "text/javascript" })
      ).toThrow(/credential|private key/i);
    }
  });

  it("rejects an individual file over the three-megabyte bound", () => {
    expect(() =>
      validateImportFile({
        path: "assets/large.png",
        bytes: new Uint8Array(3_000_001),
        contentType: "image/png"
      })
    ).toThrow(/3 MB/i);
  });

  it("accepts text at 750,000 bytes and rejects it at 750,001 bytes before decoding", () => {
    expect(validateImportFile({
      path: "assets/bounded.txt",
      bytes: new Uint8Array(750_000).fill(0x61),
      contentType: "text/plain"
    })).toMatchObject({ text: true });

    expect(() => validateImportFile({
      path: "assets/too-large.txt",
      bytes: new Uint8Array(750_001).fill(0x61),
      contentType: "text/plain"
    })).toThrow(/750,000-byte text limit/i);
  });

  it("keeps safe binary assets eligible up to the shared three-megabyte bound", () => {
    const bytes = new Uint8Array(750_001);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);

    expect(validateImportFile({
      path: "assets/large.png",
      bytes,
      contentType: "image/png"
    })).toMatchObject({ text: false });
  });
});
