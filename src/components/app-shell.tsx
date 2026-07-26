import type { ReactNode } from "react";

import { AppNav } from "./app-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1440px] p-5 md:p-8">{children}</main>
    </>
  );
}
