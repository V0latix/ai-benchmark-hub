"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { NormalizedRun } from "../lib/sources/types";

type Filters = { search: string; source: string; model: string; harness: string; status: string; sort: "cost" | "score" | "date" | "duration" };
const dash = (value: string | number | null) => value ?? "—";

export function filterRuns(runs: NormalizedRun[], filters: Filters) {
  const search = filters.search.toLowerCase().trim();
  const key = filters.sort === "cost" ? "totalCostUsd" : filters.sort === "score" ? "score" : filters.sort === "duration" ? "durationMs" : "createdAt";
  return runs.filter((run) => (!filters.source || run.sourceId === filters.source) && (!filters.model || run.model === filters.model) && (!filters.harness || run.harness === filters.harness) && (!filters.status || run.status === filters.status) && (!search || [run.sourceId, run.model, run.provider, run.harness, run.task].some((value) => value?.toLowerCase().includes(search)))).sort((left, right) => {
    const a = left[key] ?? -Infinity; const b = right[key] ?? -Infinity;
    return typeof a === "string" && typeof b === "string" ? b.localeCompare(a) : Number(b) - Number(a);
  });
}

export function RunTable({ runs }: { runs: NormalizedRun[] }) {
  const [filters, setFilters] = useState<Filters>({ search: "", source: "", model: "", harness: "", status: "", sort: "cost" });
  const visible = useMemo(() => filterRuns(runs, filters), [runs, filters]);
  const options = (field: "sourceId" | "model" | "harness") => [...new Set(runs.flatMap((run) => run[field] ? [run[field] as string] : []))].sort();
  const select = (label: string, field: keyof Filters, values: string[]) => <select aria-label={label} className="rounded border border-slate-700 bg-slate-950 px-3 py-2" value={filters[field]} onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}><option value="">All {label.toLowerCase()}s</option>{values.map((value) => <option key={value} value={value}>{value}</option>)}</select>;
  return <><div className="mb-4 flex flex-wrap gap-3"><input aria-label="Search runs" className="rounded border border-slate-700 bg-slate-950 px-3 py-2" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search model, task…"/>{select("source", "source", options("sourceId"))}{select("model", "model", options("model"))}{select("harness", "harness", options("harness"))}{select("status", "status", ["success", "failed", "partial", "timeout", "unknown"])}<select aria-label="Sort runs" className="rounded border border-slate-700 bg-slate-950 px-3 py-2" value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as Filters["sort"] })}><option value="cost">Cost</option><option value="score">Score</option><option value="date">Date</option><option value="duration">Duration</option></select></div><div className="overflow-x-auto rounded-lg border border-slate-800"><table className="w-full text-left text-sm"><thead className="bg-slate-900 text-slate-400"><tr>{["Model", "Source", "Provider", "Harness", "Task", "Status", "Score", "Cost", "Duration", "Tokens", "Created"].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((run) => <tr className="border-t border-slate-800" key={run.id}><td className="p-3"><Link className="text-sky-300" href={`/runs/${run.id}`}>{dash(run.model)}</Link></td><td className="p-3">{run.sourceId}</td><td className="p-3">{dash(run.provider)}</td><td className="p-3">{dash(run.harness)}</td><td className="p-3">{dash(run.task)}</td><td className="p-3">{run.status}</td><td className="p-3">{dash(run.score)}</td><td className="p-3">{run.totalCostUsd === null ? "—" : `$${run.totalCostUsd.toFixed(3)}`}</td><td className="p-3">{run.durationMs === null ? "—" : `${run.durationMs}ms`}</td><td className="p-3">{dash(run.totalTokens)}</td><td className="p-3">{run.createdAt ? new Date(run.createdAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div></>;
}
