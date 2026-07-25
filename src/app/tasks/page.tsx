import Link from "next/link";
import { SafeGitHubReader } from "../../lib/github/client";
import { benchmarkSources } from "../../lib/sources/config";
import { getTaskSummaries } from "../../lib/storage/queries";
import { getMelvynxTaskPrompt } from "../../lib/tasks/catalog";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const tasks = await getTaskSummaries(); const requested = (await searchParams).task;
  const selected = tasks.find((task) => task.task === requested) ?? tasks[0]; const prompt = selected ? getMelvynxTaskPrompt(selected.task) : null;
  const melvynx = benchmarkSources.find((source) => source.id === "melvynx-benchmarks"); let text: string | null = null;
  if (melvynx && prompt) { try { text = await new SafeGitHubReader().readText(melvynx, prompt.path); } catch { text = null; } }
  return <section><div className="mb-6"><h1 className="text-3xl font-semibold text-white">Tasks</h1><p className="mt-2 text-slate-400">Browse benchmark tasks and the canonical prompt used for each Melvynx task.</p></div><div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"><aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 p-2">{tasks.map((task) => <Link className={`block rounded-lg px-3 py-3 ${task.task === selected?.task ? "bg-sky-400/15 text-sky-100" : "text-slate-300 hover:bg-slate-800"}`} href={`/tasks?task=${encodeURIComponent(task.task)}`} key={task.task}><p className="font-medium">{task.task}</p><p className="mt-1 text-xs text-slate-400">{task.runCount} runs · {task.sourceCount} source{task.sourceCount === 1 ? "" : "s"}</p></Link>)}</aside><article className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/40 p-5">{selected ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">{selected.task}</h2><p className="mt-1 text-sm text-slate-400">Canonical benchmark prompt</p></div>{prompt && <Link className="text-sm text-sky-300" href={`https://benchmark.melvynx.dev/prompts/${prompt.slug}`}>Open canonical prompt</Link>}</div>{text ? <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-200">{text}</pre> : <p className="mt-6 text-slate-400">No canonical prompt is catalogued for this task yet.</p>}</> : <p className="text-slate-400">No tasks are available.</p>}</article></div></section>;
}
