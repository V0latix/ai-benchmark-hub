import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/app-shell";

export const metadata: Metadata = {
  title: "Melvynx Benchmarks",
  description: "Explorez les tâches Melvynx et comparez les runs de modèles IA."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><AppShell>{children}</AppShell></body></html>;
}
