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
      ADMIN_SESSION_SECRET: "session-secret",
      BENCHMARK_GITHUB_TOKEN: "github-token",
      UNRELATED_SECRET: "must-not-be-returned"
    })).toEqual({ passwordHash: "scrypt$hash", sessionSecret: "session-secret", githubToken: "github-token" });
  });

  it("treats blank required variables as missing without revealing their values", () => {
    expect(() => readAdminEnvironment({
      ADMIN_PASSWORD_HASH: "",
      ADMIN_SESSION_SECRET: "present",
      BENCHMARK_GITHUB_TOKEN: "   "
    })).toThrow("Missing server environment variables: ADMIN_PASSWORD_HASH, BENCHMARK_GITHUB_TOKEN");
  });
});
