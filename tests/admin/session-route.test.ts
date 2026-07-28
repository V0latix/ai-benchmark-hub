import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashAdminPassword } from "../../src/lib/admin/auth";

const cookieStore = vi.hoisted(() => ({
  set: vi.fn()
}));
let testIp = 0;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore)
}));

async function loadRoute() {
  return import("../../src/app/api/admin/session/route");
}

async function login(password = "correct horse") {
  const { POST } = await loadRoute();
  return POST(new Request("https://hub.example/api/admin/session", {
    method: "POST",
    body: JSON.stringify({ password }),
    headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${testIp}` }
  }));
}

describe("admin session route", () => {
  beforeEach(async () => {
    testIp += 1;
    vi.stubEnv("ADMIN_PASSWORD_HASH", await hashAdminPassword("correct horse", Buffer.alloc(16, 7)));
    vi.stubEnv("ADMIN_SESSION_SECRET", "session-secret-with-at-least-32-bytes");
    vi.stubEnv("BENCHMARK_GITHUB_TOKEN", "github-token");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    cookieStore.set.mockReset();
    vi.unstubAllEnvs();
  });

  it("sets a signed strict secure eight-hour session after a valid password", async () => {
    const response = await login();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ csrf: expect.any(String) });
    expect(cookieStore.set).toHaveBeenCalledWith("benchmark_admin", expect.any(String), {
      httpOnly: true,
      maxAge: 28_800,
      path: "/",
      sameSite: "strict",
      secure: true
    });
  });

  it("returns a generic refusal without creating a session for invalid credentials", async () => {
    const response = await login("wrong");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Accès refusé" });
    expect(response.headers.get("retry-after")).toBeNull();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("fails closed when an admin secret is absent", async () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "");

    const response = await login();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Accès refusé" });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("returns a retry header once the login limit is exceeded", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await login("wrong");

    const response = await login("wrong");

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Accès refusé" });
    expect(response.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("clears the strict session cookie on logout", async () => {
    const { DELETE } = await loadRoute();
    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(cookieStore.set).toHaveBeenCalledWith("benchmark_admin", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "strict",
      secure: true
    });
  });
});
