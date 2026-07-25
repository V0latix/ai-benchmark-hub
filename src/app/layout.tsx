import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Benchmark Hub",
  description: "Compare public AI and coding-agent benchmark runs."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
