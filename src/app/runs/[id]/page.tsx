import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonViewer } from "../../../components/json-viewer";
import { RunVisual } from "../../../components/run-visual";
import { benchmarkSources } from "../../../lib/sources/config";
import { SafeGitHubReader } from "../../../lib/github/client";
import { getRunById } from "../../../lib/storage/queries";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const run = await getRunById((await params).id); if (!run) notFound();
  const source = benchmarkSources.find((item) => item.id === run.sourceId); const branch = source?.branch ?? "main";
  const links = [["Prompt", run.promptPath], ["Transcript", run.transcriptPath], ["Result", run.resultPath], ["Evidence", run.evidencePath], ["Screenshot", run.screenshotPath], ["Preview", run.previewPath]].filter(([, path]) => path);
  let transcript: string | null = null; if (source && run.transcriptPath) { try { transcript = await new SafeGitHubReader().readText(source, run.transcriptPath); } catch { transcript = null; } }
  return <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><Link className="text-sm text-sky-300" href="/runs">← All runs</Link><h1 className="mt-2 text-3xl font-semibold text-white">{run.task ?? "Untitled result"}</h1><p className="mt-1 text-slate-400">{run.model ?? "Unknown model"} · {run.harness ?? "Unknown harness"}</p></div><span className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300">{run.status}</span></div><RunVisual run={run} branch={branch}/><div className="my-6 flex flex-wrap gap-3">{links.map(([label, path]) => <Link className="text-sm text-sky-300" key={label} href={`https://github.com/${run.sourceRepo}/blob/${branch}/${path}`}>{label}</Link>)}</div><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries({ Source: run.sourceId, Task: run.task, Score: run.score, Cost: run.totalCostUsd, Tokens: run.totalTokens, Duration: run.durationMs, Created: run.createdAt, Provider: run.provider }).map(([label, value]) => <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3" key={label}><dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1">{value ?? "—"}</dd></div>)}</dl>{transcript && <details className="my-6 rounded border border-slate-800 p-3"><summary className="cursor-pointer font-medium">Transcript</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{transcript}</pre></details>}<div className="mt-6"><JsonViewer value={run.raw}/></div></section>;
}
