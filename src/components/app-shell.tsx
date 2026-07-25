import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-[1440px] p-5 md:p-8"><nav className="mb-8 flex flex-wrap items-center gap-5 border-b border-slate-800 pb-4"><Link className="font-semibold text-white" href="/">AI Benchmark Hub</Link><Link href="/runs">Runs</Link><Link href="/compare">Compare</Link><Link className="ml-auto rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-sky-400 hover:text-sky-200" href="/sources">Sources</Link></nav><p className="mb-6 rounded-md border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-100">Sources use different methodologies; interpret cross-repository comparisons with caution.</p>{children}</main>;
}
