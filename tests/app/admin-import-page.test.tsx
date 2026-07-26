// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminSession } from "../../src/lib/admin/auth";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore)
}));

async function renderPage() {
  const { default: AdminImportPage } = await import("../../src/app/admin/import/page");
  render(await AdminImportPage());
}

describe("admin import page", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_PASSWORD_HASH", "scrypt$hash$hash");
    vi.stubEnv("ADMIN_SESSION_SECRET", "session-secret");
    vi.stubEnv("BENCHMARK_GITHUB_TOKEN", "github-token");
    cookieStore.get.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
    cookieStore.get.mockReset();
    vi.unstubAllEnvs();
  });

  it("shows only the login purpose and privacy warning without a verified session", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Importer un benchmark" })).toBeInTheDocument();
    expect(screen.getByText(/fichiers et métadonnées seront contrôlés/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe administrateur")).toBeInTheDocument();
    expect(screen.queryByText("Import bientôt disponible")).not.toBeInTheDocument();
  });

  it("rejects a tampered session and keeps the import shell private", async () => {
    cookieStore.get.mockReturnValue({ value: `${createAdminSession("session-secret", { csrf: "csrf" })}x` });

    await renderPage();

    expect(screen.getByLabelText("Mot de passe administrateur")).toBeInTheDocument();
    expect(screen.queryByText("Import bientôt disponible")).not.toBeInTheDocument();
  });

  it("renders the import shell only for a verified server-side session", async () => {
    cookieStore.get.mockReturnValue({ value: createAdminSession("session-secret", { csrf: "csrf" }) });

    await renderPage();

    expect(screen.getByText("Import bientôt disponible")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mot de passe administrateur")).not.toBeInTheDocument();
    expect(screen.queryByText("csrf")).not.toBeInTheDocument();
  });
});
