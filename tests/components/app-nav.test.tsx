// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AppNav } from "../../src/components/app-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/compare" }));

it("marks Compare as the current destination and exposes the admin import", () => {
  render(<AppNav />);

  expect(screen.getByRole("link", { name: "Comparer" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Ajouter un run/ })).toHaveAttribute("href", "/admin/import");
});
