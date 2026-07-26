import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../src/lib/admin/auth";
import type { AdminEnvironment } from "../../src/lib/admin/env";
import { AdminRequestError, requireAdmin, requireAdminMutation } from "../../src/lib/admin/request-guard";

const env: AdminEnvironment = {
  passwordHash: "scrypt$test$test",
  sessionSecret: "session-secret",
  githubToken: "test-token"
};

function sessionCookie(csrf = "Y3NyZi10ZXN0LXZhbHVl") {
  return createAdminSession(env.sessionSecret, { now: Date.now(), ttlMs: 10_000, csrf });
}

function request(headers: HeadersInit = {}) {
  return new Request("https://hub.example/api/admin/imports", { method: "POST", headers });
}

describe("admin request guards", () => {
  it("requires a signed session", async () => {
    await expect(requireAdmin(request(), env)).rejects.toEqual(expect.any(AdminRequestError));
    await expect(requireAdmin(request({ cookie: "benchmark_admin=invalid" }), env)).rejects.toEqual(expect.any(AdminRequestError));
  });

  it("reads a signed session from a cookie without matching a similarly named cookie", async () => {
    const csrf = "Y3NyZi10ZXN0LXZhbHVl";
    const session = sessionCookie(csrf);

    await expect(requireAdmin(request({ cookie: `other_benchmark_admin=${session}; benchmark_admin=${session}` }), env)).resolves.toMatchObject({ csrf });
  });

  it("requires a signed session, same origin, and matching CSRF token", async () => {
    const csrf = "Y3NyZi10ZXN0LXZhbHVl";
    const session = sessionCookie(csrf);
    const validRequest = request({
      cookie: `benchmark_admin=${session}`,
      origin: "https://hub.example",
      "x-csrf-token": csrf
    });

    await expect(requireAdminMutation(validRequest, env)).resolves.toMatchObject({ csrf });
    await expect(requireAdminMutation(request({ cookie: `benchmark_admin=${session}`, origin: "https://attacker.example", "x-csrf-token": csrf }), env)).rejects.toEqual(expect.any(AdminRequestError));
    await expect(requireAdminMutation(request({ cookie: `benchmark_admin=${session}`, origin: "https://hub.example", "x-csrf-token": "wrong" }), env)).rejects.toEqual(expect.any(AdminRequestError));
  });

  it("rejects a malformed cookie header", async () => {
    await expect(requireAdmin(request({ cookie: "benchmark_admin=%E0%A4%A" }), env)).rejects.toEqual(expect.any(AdminRequestError));
  });
});
