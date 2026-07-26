import "server-only";

import { createHash } from "node:crypto";

export const LOGIN_ATTEMPT_LIMIT = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1_000;
export const LOGIN_IP_HASH_LIMIT = 2_048;

export type LoginAttemptResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type LoginBucket = {
  attempts: number[];
};

type LoginLimiterOptions = {
  maxEntries?: number;
};

function trustedProxyClientIp(request: Request): string {
  // The Vercel deployment is the trust boundary for these proxy headers. Use
  // only its first forwarded hop and ignore arbitrary fallback IP headers.
  const candidate = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return candidate.toLowerCase().replace(/^::ffff:/, "");
}

function clientIpHash(request: Request): string {
  return createHash("sha256").update(trustedProxyClientIp(request)).digest("base64url");
}

export class LoginLimiter {
  private readonly attemptsByIpHash = new Map<string, LoginBucket>();
  private readonly maxEntries: number;

  constructor(options: LoginLimiterOptions = {}) {
    this.maxEntries = options.maxEntries ?? LOGIN_IP_HASH_LIMIT;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) throw new Error("Invalid login limiter capacity");
  }

  attempt(request: Request, now = Date.now()): LoginAttemptResult {
    const key = clientIpHash(request);
    const earliest = now - LOGIN_WINDOW_MS;
    this.sweepExpired(earliest);

    let bucket = this.attemptsByIpHash.get(key);
    if (!bucket) {
      if (this.attemptsByIpHash.size >= this.maxEntries) this.evictOldest();
      bucket = { attempts: [] };
      this.attemptsByIpHash.set(key, bucket);
    }

    if (bucket.attempts.length >= LOGIN_ATTEMPT_LIMIT) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.attempts[0] + LOGIN_WINDOW_MS - now) / 1_000) };
    }

    bucket.attempts.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweepExpired(earliest: number): void {
    for (const [key, bucket] of this.attemptsByIpHash) {
      bucket.attempts = bucket.attempts.filter((timestamp) => timestamp > earliest);
      if (!bucket.attempts.length) this.attemptsByIpHash.delete(key);
    }
  }

  private evictOldest(): void {
    let oldest: { key: string; timestamp: number } | null = null;
    for (const [key, bucket] of this.attemptsByIpHash) {
      const timestamp = bucket.attempts.at(-1) ?? Number.NEGATIVE_INFINITY;
      if (!oldest || timestamp < oldest.timestamp || (timestamp === oldest.timestamp && key < oldest.key)) {
        oldest = { key, timestamp };
      }
    }
    if (oldest) this.attemptsByIpHash.delete(oldest.key);
  }
}

const loginLimiter = new LoginLimiter();

export function checkLoginAttempt(request: Request, now = Date.now()): LoginAttemptResult {
  return loginLimiter.attempt(request, now);
}
