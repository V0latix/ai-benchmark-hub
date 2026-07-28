import { describe, expect, it } from "vitest";

import { readAdminEnvironment } from "../../src/lib/admin/env";

describe("readAdminEnvironment", () => {
  it("reports missing server variables by name without revealing values", () => {
    expect(() => readAdminEnvironment({})).toThrow(
      "Missing server environment variables: ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, BENCHMARK_GITHUB_TOKEN"
    );
  });

  it("returns only validated admin secrets", () => {
    expect(readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "scrypt$hash",
      ADMIN_SESSION_SECRET: "s".repeat(32),
      BENCHMARK_GITHUB_TOKEN: "github-token",
      UNRELATED_SECRET: "must-not-be-returned"
    })).toEqual({ passwordHash: "scrypt$hash", sessionSecret: "s".repeat(32), githubToken: "github-token" });
  });

  it("treats blank required variables as missing without revealing their values", () => {
    expect(() => readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "",
      ADMIN_SESSION_SECRET: "s".repeat(32),
      BENCHMARK_GITHUB_TOKEN: "   "
    })).toThrow("Missing server environment variables: ADMIN_PASSWORD_HASH, BENCHMARK_GITHUB_TOKEN");
  });

  it("rejects deliberately invalid placeholders for every variable without revealing values", () => {
    expect(() => readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "scrypt$INVALID_EXAMPLE_SALT$INVALID_EXAMPLE_HASH",
      ADMIN_SESSION_SECRET: "INVALID_REPLACE_WITH_32_RANDOM_BYTES",
      BENCHMARK_GITHUB_TOKEN: "INVALID_FINE_GRAINED_TOKEN"
    })).toThrow(
      "Invalid server environment variables: ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, BENCHMARK_GITHUB_TOKEN"
    );
  });

  it("requires at least 32 UTF-8 bytes for the session secret", () => {
    expect(() => readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "scrypt$hash",
      ADMIN_SESSION_SECRET: "s".repeat(31),
      BENCHMARK_GITHUB_TOKEN: "github-token"
    })).toThrow("Invalid server environment variables: ADMIN_SESSION_SECRET");

    expect(readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "scrypt$hash",
      ADMIN_SESSION_SECRET: "é".repeat(16),
      BENCHMARK_GITHUB_TOKEN: "github-token"
    }).sessionSecret).toBe("é".repeat(16));
  });
});
