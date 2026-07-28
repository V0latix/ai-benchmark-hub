import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { runAdminPasswordHasher } from "../../scripts/hash-admin-password";
import { verifyAdminPassword } from "../../src/lib/admin/auth";

type FakeTty = PassThrough & {
  isRaw: boolean;
  isTTY: boolean;
  setRawMode: (mode: boolean) => FakeTty;
};

function createFakeTty() {
  const stream = new PassThrough() as FakeTty;
  Object.defineProperties(stream, {
    isRaw: { configurable: true, value: false, writable: true },
    isTTY: { configurable: true, value: true, writable: true }
  });
  stream.setRawMode = (mode) => {
    stream.isRaw = mode;
    return stream;
  };
  return stream;
}

describe("admin import configuration", () => {
  it("ships deliberately invalid examples and the password hash command", async () => {
    const [packageText, envText, readme] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile(".env.example", "utf8"),
      readFile("README.md", "utf8")
    ]);

    expect(JSON.parse(packageText).scripts["admin:hash-password"]).toBe(
      "tsx scripts/hash-admin-password.ts"
    );
    expect(envText).toContain(
      "ADMIN_PASSWORD_HASH=scrypt$INVALID_EXAMPLE_SALT$INVALID_EXAMPLE_HASH"
    );
    expect(envText).toContain(
      "ADMIN_SESSION_SECRET=INVALID_REPLACE_WITH_32_RANDOM_BYTES"
    );
    expect(envText).toContain(
      "BENCHMARK_GITHUB_TOKEN=INVALID_FINE_GRAINED_TOKEN"
    );
    expect(envText).not.toMatch(/github_pat_|ghp_/);

    expect(readme).toContain("Melvynx/benchmarks");
    expect(readme).toContain("Contents: Read and write");
    expect(readme).toContain("ADMIN_PASSWORD_HASH");
    expect(readme).toContain("ADMIN_SESSION_SECRET");
    expect(readme).toContain("BENCHMARK_GITHUB_TOKEN");
    expect(readme).toMatch(/technically public/i);
    expect(readme).toContain("InMemoryGitWriter");
  });

  it("hashes hidden TTY input without leaking the password to either output", async () => {
    const input = createFakeTty();
    let stdout = "";
    let stderr = "";
    const running = runAdminPasswordHasher({
      input,
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: (value) => { stderr += value; } }
    });

    input.write("correct horse\r");
    await running;

    const encoded = stdout.trim();
    expect(encoded).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    await expect(verifyAdminPassword("correct horse", encoded)).resolves.toBe(true);
    expect(`${stdout}${stderr}`).not.toContain("correct horse");
    expect(stderr).toMatch(/password/i);
    expect(input.isRaw).toBe(false);
  });

  it("refuses non-interactive input before producing a hash", async () => {
    const input = createFakeTty();
    input.isTTY = false;
    let stdout = "";

    await expect(runAdminPasswordHasher({
      input,
      stdout: { write: (value) => { stdout += value; } },
      stderr: { write: () => undefined }
    })).rejects.toThrow(/interactive TTY/i);
    expect(stdout).toBe("");
  });

  it("runs as a standalone server script and fails closed without a TTY", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/hash-admin-password.ts"],
      { cwd: process.cwd(), encoding: "utf8", input: "" }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Unable to generate the administrator password hash."
    );
    expect(result.stderr).not.toMatch(/server-only|node_modules|correct horse/i);
  });
});
