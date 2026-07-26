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
});
