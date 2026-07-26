import "server-only";

import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1_000;
const SCRYPT_KEY_BYTES = 64;
const SESSION_SIGNATURE_BYTES = 32;

export type PasswordHash = `scrypt$${string}$${string}`;

export type AdminSession = {
  version: 1;
  expiresAt: number;
  csrf: string;
};

type SessionOptions = {
  now?: number;
  ttlMs?: number;
  csrf?: string;
};

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function decodeBase64Url(value: string): Buffer | null {
  if (!isBase64Url(value)) return null;

  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function hmac(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

function fixedLengthEqual(expected: Buffer, supplied: Buffer | null, expectedLength: number): boolean {
  const comparable = Buffer.alloc(expectedLength);
  const validLength = supplied?.byteLength === expectedLength;
  if (supplied) supplied.copy(comparable, 0, 0, expectedLength);
  return Boolean(validLength) && timingSafeEqual(expected, comparable);
}

export async function hashAdminPassword(password: string, salt: Uint8Array = randomBytes(16)): Promise<PasswordHash> {
  if (!salt.byteLength) throw new Error("Password salt must not be empty");
  const derived = await scrypt(password, salt, SCRYPT_KEY_BYTES) as Buffer;
  return `scrypt$${Buffer.from(salt).toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyAdminPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, encodedSalt, encodedHash, ...extra] = encoded.split("$");
  if (algorithm !== "scrypt" || extra.length || !encodedSalt || !encodedHash) return false;

  const salt = decodeBase64Url(encodedSalt);
  const expected = decodeBase64Url(encodedHash);
  if (!salt?.byteLength || !expected) return false;

  try {
    const derived = await scrypt(password, salt, SCRYPT_KEY_BYTES) as Buffer;
    return fixedLengthEqual(derived, expected, SCRYPT_KEY_BYTES);
  } catch {
    return false;
  }
}

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createAdminSession(secret: string, options: SessionOptions = {}): string {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? ADMIN_SESSION_TTL_MS;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error("Invalid admin session lifetime");

  const session: AdminSession = { version: 1, expiresAt: now + ttlMs, csrf: options.csrf ?? createCsrfToken() };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${hmac(payload, secret).toString("base64url")}`;
}

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AdminSession>;
  return session.version === 1
    && typeof session.expiresAt === "number"
    && Number.isSafeInteger(session.expiresAt)
    && typeof session.csrf === "string"
    && session.csrf.length > 0;
}

export function verifyAdminSession(token: string, secret: string, now = Date.now()): AdminSession | null {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;

  const decodedPayload = decodeBase64Url(payload);
  if (!decodedPayload) return null;
  const suppliedSignature = decodeBase64Url(signature);
  if (!fixedLengthEqual(hmac(payload, secret), suppliedSignature, SESSION_SIGNATURE_BYTES)) return null;

  try {
    const parsed = JSON.parse(decodedPayload.toString("utf8")) as unknown;
    return isAdminSession(parsed) && parsed.expiresAt > now ? parsed : null;
  } catch {
    return null;
  }
}
