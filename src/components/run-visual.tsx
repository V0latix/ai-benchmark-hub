import Link from "next/link";

import type { NormalizedRun } from "../lib/sources/types";

type Visual = { kind: "screenshot" | "preview"; path: string; url: string } | { kind: "unavailable" };

function rawUrl(repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function getRunVisual(run: Pick<NormalizedRun, "sourceRepo" | "screenshotPath" | "previewPath">, branch: string): Visual {
  if (run.screenshotPath) return { kind: "screenshot", path: run.screenshotPath, url: rawUrl(run.sourceRepo, branch, run.screenshotPath) };
  if (run.previewPath) return { kind: "preview", path: run.previewPath, url: rawUrl(run.sourceRepo, branch, run.previewPath) };
  return { kind: "unavailable" };
}

export function RunVisual({ run, branch }: { run: NormalizedRun; branch: string }) {
  const visual = getRunVisual(run, branch);
  if (visual.kind === "unavailable") return <section className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/70 text-center text-sm text-slate-400"><div><p>No visual artifact is available for this run.</p>{run.resultPath && <Link className="mt-2 inline-block text-sky-300" href={`https://github.com/${run.sourceRepo}/blob/${branch}/${run.resultPath}`}>Open the source result</Link>}</div></section>;
  return <section className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl shadow-sky-950/20"><div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><p className="text-sm font-medium text-white">{visual.kind === "screenshot" ? "Result screenshot" : "Result preview"}</p><p className="text-xs text-slate-400">Sandboxed — external scripts are disabled</p></div><Link className="text-sm text-sky-300" href={`https://github.com/${run.sourceRepo}/blob/${branch}/${visual.path}`}>Open source</Link></div><iframe className="aspect-video w-full bg-white" sandbox="" src={visual.url} title={`Visual result for ${run.id}`}/></section>;
}
