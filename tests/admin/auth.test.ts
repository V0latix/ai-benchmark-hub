import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_TTL_MS,
  createAdminSession,
  createCsrfToken,
  hashAdminPassword,
  verifyAdminPassword,
  verifyAdminSession
} from "../../src/lib/admin/auth";

const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function equivalentNonCanonicalBase64Url(value: string): string {
  const remainder = value.length % 4;
  const unusedBits = remainder === 2 ? 4 : remainder === 3 ? 2 : 0;
  if (!unusedBits) throw new Error("Fixture has no unused base64url bits");

  const lastIndex = base64UrlAlphabet.indexOf(value.at(-1)!);
  const changedIndex = lastIndex | 1;
  if (changedIndex === lastIndex) throw new Error("Fixture is already noncanonical");
  return `${value.slice(0, -1)}${base64UrlAlphabet[changedIndex]}`;
}

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

  it("rejects a noncanonical signature that decodes to the valid HMAC", () => {
    const token = createAdminSession("secret", { now: 1_000, ttlMs: 100, csrf: "csrf" });
    const [payload, signature] = token.split(".");
    const noncanonicalSignature = equivalentNonCanonicalBase64Url(signature);

    expect(Buffer.from(noncanonicalSignature, "base64url")).toEqual(Buffer.from(signature, "base64url"));
    expect(verifyAdminSession(`${payload}.${noncanonicalSignature}`, "secret", 1_050)).toBeNull();
  });

  it("rejects a validly signed noncanonical payload encoding", () => {
    let token = createAdminSession("secret", { now: 1_000, ttlMs: 100, csrf: "c" });
    while (token.split(".")[0].length % 4 === 0) {
      const csrf = `${JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).csrf}c`;
      token = createAdminSession("secret", { now: 1_000, ttlMs: 100, csrf });
    }
    const [payload] = token.split(".");
    const noncanonicalPayload = equivalentNonCanonicalBase64Url(payload);
    const signature = createHmac("sha256", "secret").update(noncanonicalPayload).digest("base64url");

    expect(Buffer.from(noncanonicalPayload, "base64url")).toEqual(Buffer.from(payload, "base64url"));
    expect(verifyAdminSession(`${noncanonicalPayload}.${signature}`, "secret", 1_050)).toBeNull();
  });
});
