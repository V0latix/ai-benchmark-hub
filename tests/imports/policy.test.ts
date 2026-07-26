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
        contentType: "text/plain"
      })
    ).toMatchObject({ path: "assets/logo.png", contentType: "image/png", text: false });
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
});
