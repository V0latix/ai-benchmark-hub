"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Explorer" },
  { href: "/compare", label: "Comparer" },
  { href: "/runs", label: "Tous les runs" }
];

function isCurrentDestination(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 md:px-8">
        <Link className="shrink-0 font-semibold tracking-tight text-[var(--text-primary)]" href="/">
          Melvynx Benchmarks
        </Link>
        <nav aria-label="Navigation principale" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {destinations.map((destination) => {
            const isCurrent = isCurrentDestination(pathname, destination.href);

            return (
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isCurrent
                    ? "bg-[var(--accent)] text-slate-950"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                }`}
                href={destination.href}
                key={destination.href}
              >
                {destination.label}
              </Link>
            );
          })}
        </nav>
        <Link
          className="ml-auto shrink-0 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          href="/admin/import"
        >
          Admin · Ajouter un run
        </Link>
      </div>
    </header>
  );
}
