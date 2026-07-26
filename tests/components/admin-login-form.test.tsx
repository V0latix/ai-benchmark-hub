// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminLoginForm } from "../../src/components/admin-login-form";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminLoginForm", () => {
  it("submits the password without retaining it after a failed login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      })
    ));
    render(<AdminLoginForm />);

    fireEvent.change(screen.getByLabelText("Mot de passe administrateur"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Accès refusé")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe administrateur")).toHaveValue("");
  });

  it("does not expose a server error when the login request cannot complete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network details")));
    render(<AdminLoginForm />);

    fireEvent.change(screen.getByLabelText("Mot de passe administrateur"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Accès refusé")).toBeInTheDocument();
    expect(screen.queryByText("network details")).not.toBeInTheDocument();
  });
});
