import { describe, expect, it } from "vitest";

import { LoginLimiter } from "../../src/lib/admin/login-limiter";

describe("LoginLimiter", () => {
  it("permits five attempts per normalized IP hash in ten minutes", () => {
    const limiter = new LoginLimiter();
    const request = new Request("https://hub.example/api/admin/session", { headers: { "x-forwarded-for": " 203.0.113.7, 10.0.0.1" } });

    for (let count = 0; count < 5; count += 1) expect(limiter.attempt(request, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.attempt(request, 1_001)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(limiter.attempt(request, 601_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("keeps separately normalized client IPs in separate buckets", () => {
    const limiter = new LoginLimiter();
    const first = new Request("https://hub.example", { headers: { "x-forwarded-for": "203.0.113.7" } });
    const second = new Request("https://hub.example", { headers: { "x-forwarded-for": "203.0.113.8" } });

    for (let count = 0; count < 5; count += 1) limiter.attempt(first, 1_000);
    expect(limiter.attempt(second, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("bounds unique active IP hashes and deterministically evicts the oldest bucket", () => {
    const limiter = new LoginLimiter({ maxEntries: 3 });
    const requests = Array.from({ length: 20 }, (_, index) => new Request("https://hub.example", {
      headers: { "x-vercel-forwarded-for": `203.0.113.${index}` }
    }));

    for (const [index, request] of requests.entries()) {
      for (let count = 0; count < 5; count += 1) limiter.attempt(request, 1_000 + index);
    }

    for (const request of requests.slice(17)) {
      expect(limiter.attempt(request, 2_000)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    }
    expect(limiter.attempt(requests[16], 2_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("sweeps expired buckets before applying the active-IP cap", () => {
    const limiter = new LoginLimiter({ maxEntries: 2 });
    const expired = new Request("https://hub.example", { headers: { "x-vercel-forwarded-for": "203.0.113.1" } });
    const retained = new Request("https://hub.example", { headers: { "x-vercel-forwarded-for": "203.0.113.2" } });
    const added = new Request("https://hub.example", { headers: { "x-vercel-forwarded-for": "203.0.113.3" } });

    for (let count = 0; count < 5; count += 1) limiter.attempt(expired, 0);
    for (let count = 0; count < 5; count += 1) limiter.attempt(retained, 600_001);
    limiter.attempt(added, 600_002);

    expect(limiter.attempt(retained, 600_003)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(limiter.attempt(expired, 600_003)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("prefers the Vercel proxy IP and ignores untrusted fallback IP headers", () => {
    const limiter = new LoginLimiter();
    const request = (forwarded: string, realIp: string) => new Request("https://hub.example", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.7",
        "x-forwarded-for": forwarded,
        "x-real-ip": realIp
      }
    });

    for (let count = 0; count < 5; count += 1) limiter.attempt(request(`198.51.100.${count}`, `192.0.2.${count}`), 1_000);
    expect(limiter.attempt(request("198.51.100.99", "192.0.2.99"), 1_001)).toEqual({ allowed: false, retryAfterSeconds: 600 });
  });

  it("uses one conservative bucket when trusted proxy IP headers are absent", () => {
    const limiter = new LoginLimiter();

    for (let count = 0; count < 5; count += 1) {
      const request = new Request("https://hub.example", { headers: { "x-real-ip": `203.0.113.${count}` } });
      expect(limiter.attempt(request, 1_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    }
    const anotherFallback = new Request("https://hub.example", { headers: { "x-real-ip": "203.0.113.99" } });
    expect(limiter.attempt(anotherFallback, 1_001)).toEqual({ allowed: false, retryAfterSeconds: 600 });
  });
});
