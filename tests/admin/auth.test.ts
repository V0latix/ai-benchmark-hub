import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_TTL_MS,
  createAdminSession,
  createCsrfToken,
  hashAdminPassword,
  verifyAdminPassword,
  verifyAdminSession
} from "../../src/lib/admin/auth";

describe("admin auth", () => {
  it("verifies the configured scrypt password hash", async () => {
    const encoded = await hashAdminPassword("correct horse", Buffer.alloc(16, 7));

    await expect(verifyAdminPassword("correct horse", encoded)).resolves.toBe(true);
    await expect(verifyAdminPassword("wrong", encoded)).resolves.toBe(false);
  });

  it("rejects malformed password hashes without throwing", async () => {
    await expect(verifyAdminPassword("correct horse", "scrypt$not-a-salt$not-a-hash")).resolves.toBe(false);
    await expect(verifyAdminPassword("correct horse", "invalid")).resolves.toBe(false);
  });

  it("creates a 32-byte URL-safe CSRF token", () => {
    const csrf = createCsrfToken();

    expect(Buffer.from(csrf, "base64url")).toHaveLength(32);
    expect(csrf).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("uses an eight-hour default session lifetime", () => {
    const token = createAdminSession("secret", { now: 1_000, csrf: "csrf" });

    expect(verifyAdminSession(token, "secret", 1_000 + ADMIN_SESSION_TTL_MS - 1)).toMatchObject({
      version: 1,
      expiresAt: 1_000 + ADMIN_SESSION_TTL_MS,
      csrf: "csrf"
    });
    expect(verifyAdminSession(token, "secret", 1_000 + ADMIN_SESSION_TTL_MS)).toBeNull();
  });

  it("rejects an expired or tampered session", () => {
    const token = createAdminSession("secret", { now: 1_000, ttlMs: 100, csrf: "csrf" });

    expect(verifyAdminSession(token, "secret", 1_050)).not.toBeNull();
    expect(verifyAdminSession(`${token}x`, "secret", 1_050)).toBeNull();
    expect(verifyAdminSession(token, "secret", 1_101)).toBeNull();
  });
});
