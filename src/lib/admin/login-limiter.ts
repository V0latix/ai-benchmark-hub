import { createHash } from "node:crypto";

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1_000;

export type LoginAttemptResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function normalizedClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return candidate.toLowerCase().replace(/^::ffff:/, "");
}

function clientIpHash(request: Request): string {
  return createHash("sha256").update(normalizedClientIp(request)).digest("base64url");
}

export class LoginLimiter {
  private readonly attemptsByIpHash = new Map<string, number[]>();

  attempt(request: Request, now = Date.now()): LoginAttemptResult {
    const key = clientIpHash(request);
    const earliest = now - LOGIN_WINDOW_MS;
    const attempts = (this.attemptsByIpHash.get(key) ?? []).filter((timestamp) => timestamp > earliest);

    if (attempts.length >= LOGIN_ATTEMPT_LIMIT) {
      this.attemptsByIpHash.set(key, attempts);
      return { allowed: false, retryAfterSeconds: Math.ceil((attempts[0] + LOGIN_WINDOW_MS - now) / 1_000) };
    }

    attempts.push(now);
    this.attemptsByIpHash.set(key, attempts);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const loginLimiter = new LoginLimiter();

export function checkLoginAttempt(request: Request, now = Date.now()): LoginAttemptResult {
  return loginLimiter.attempt(request, now);
}
